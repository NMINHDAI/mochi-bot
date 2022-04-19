import { Command } from "types/common"
import {
  HexColorString,
  Message,
  MessageActionRow,
  MessageAttachment,
  MessageSelectMenu,
  SelectMenuInteraction,
} from "discord.js"
import { PREFIX } from "utils/constants"
import {
  getCommandArguments,
  getEmoji,
  getHeader,
  numberWithCommas,
  roundFloatNumber,
  thumbnails,
} from "utils/common"
import {
  composeDiscordSelectionRow,
  composeDiscordExitButton,
  composeEmbedMessage,
} from "utils/discord-embed"
import Defi from "adapter/defi"
import dayjs from "dayjs"
import { CommandChoiceHandler } from "utils/CommandChoiceManager"
import { ChartJSNodeCanvas } from "chartjs-node-canvas"
import * as Canvas from "canvas"

  function getChartColorConfig(id: string, width: number, height: number) {
    let gradientFrom, gradientTo, borderColor
    switch (id) {
      case "bitcoin":
        borderColor = "#ffa301"
        gradientFrom = "rgba(159,110,43,0.9)"
        gradientTo = "rgba(76,66,52,0.5)"
        break
      case "ethereum":
        borderColor = "#ff0421"
        gradientFrom = "rgba(173,36,43,0.9)"
        gradientTo = "rgba(77,48,53,0.5)"
        break

      case "tether":
        borderColor = "#22a07a"
        gradientFrom = "rgba(46,78,71,0.9)"
        gradientTo = "rgba(48,63,63,0.5)"
        break
      case "binancecoin" || "terra":
        borderColor = "#f5bc00"
        gradientFrom = "rgba(172,136,41,0.9)"
        gradientTo = "rgba(73,67,55,0.5)"
        break
      case "solana":
        borderColor = "#9945ff"
        gradientFrom = "rgba(116,62,184,0.9)"
        gradientTo = "rgba(61,53,83,0.5)"
        break
      default:
        borderColor = "#009cdb"
        gradientFrom = "rgba(53,83,192,0.9)"
        gradientTo = "rgba(58,69,110,0.5)"
    }

    const canvas = Canvas.createCanvas(width, height)
    const ctx = canvas.getContext("2d")
    const gradient = ctx.createLinearGradient(0, 0, 0, 400)
    gradient.addColorStop(0, gradientFrom)
    gradient.addColorStop(1, gradientTo)
    return {
      borderColor,
      backgroundColor: gradient,
    }
  }

async function renderHistoricalMarketChart({
  msg,
  id,
  currency,
  days = 7,
}: {
  msg: Message
  id: string
  currency: string
  days?: number
}) {
  const { timestamps, prices, from, to } = await Defi.getHistoricalMarketData(
    msg,
    id,
    currency,
    days
  )
  const width = 970
  const height = 650

  // draw chart
  const chartCanvas = new ChartJSNodeCanvas({ width, height })
  const axisConfig = {
    ticks: {
      font: {
        size: 20,
      },
    },
    grid: {
      borderColor: "black",
    },
  }
  const image = await chartCanvas.renderToBuffer({
    type: "line",
    data: {
      labels: timestamps,
      datasets: [
        {
          label: `Price (${currency.toUpperCase()}), ${from} - ${to}`,
          data: prices,
          borderWidth: 6,
          pointRadius: 0,
          fill: true,
          ...getChartColorConfig(id, width, height),
        },
      ],
    },
    options: {
      scales: {
        y: axisConfig,
        x: axisConfig,
      },
      plugins: {
        legend: {
          labels: {
            // This more specific font property overrides the global property
            font: {
              size: 24,
            },
          },
        },
      },
    },
  })

  return new MessageAttachment(image, "chart.png")
}

const getChangePercentage = (change: number) => {
  const trend = change > 0 ? "📈" : change === 0 ? "" : "📉"
  return `${trend} ${change > 0 ? "+" : ""}${roundFloatNumber(change, 2)}%`
}

const handler: CommandChoiceHandler = async (msgOrInteraction) => {
  const interaction = msgOrInteraction as SelectMenuInteraction
  const { message } = interaction
  const input = interaction.values[0]
  const [id, currency, days] = input.split("_")

  const chart = await renderHistoricalMarketChart({
    msg: message as Message,
    id,
    currency,
    days: +days,
  })

  message.embeds[0].image.url = "attachment://chart.png"
  const selectMenu = message.components[0].components[0] as MessageSelectMenu
  const choices = ["1", "7", "30", "60", "90", "365"]
  selectMenu.options.forEach(
    (opt, i) => (opt.default = i === choices.indexOf(days))
  )

  return {
    messageOptions: {
      embeds: message.embeds,
      files: [chart],
      components: message.components as MessageActionRow[],
      content: message.content,
    },
    commandChoiceOptions: {
      handler,
      userId: message.author.id,
      messageId: message.id,
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      interaction,
    },
  }
}

const command: Command = {
  id: "ticker",
  command: "ticker",
  name: "Ticker",
  category: "Defi",
  run: async function (msg) {
    const args = getCommandArguments(msg)
    const query = !args[1].includes("/") ? `${args[1]}/usd` : args[1]
    const [coinId, currency] = query.split("/")
    const coin = await Defi.getCoin(msg, coinId)
    const { market_cap, current_price, price_change_percentage_1h_in_currency, price_change_percentage_24h_in_currency, price_change_percentage_7d_in_currency } = coin.market_data
    const blank = getEmoji("blank")

    const embedMsg = composeEmbedMessage(msg, {
      color: getChartColorConfig(coin.id, 0, 0)
        .borderColor as HexColorString,
      author: [coin.name, coin.image.small],
      footer: ["Data fetched from CoinGecko.com"],
      image: "attachment://chart.png",
    })
      .addField(
        `Market cap (${currency.toUpperCase()})`,
        `${numberWithCommas(
          market_cap[currency.toLowerCase()] ??
            market_cap["usd"]
        )} (#${coin.market_cap_rank}) ${blank}`,
        true
      )
      .addField(
        `Price (${currency.toUpperCase()})`,
        `${numberWithCommas(
          current_price[currency.toLowerCase()] ??
            current_price["usd"]
        )}`,
        true
      )
      .addField("\u200B", "\u200B", true)
      .addField(
        "Change (1h)",
        getChangePercentage(
          price_change_percentage_1h_in_currency.usd
        ),
        true
      )
      .addField(
        `Change (24h) ${blank}`,
        getChangePercentage(
          price_change_percentage_24h_in_currency.usd
        ),
        true
      )
      .addField(
        "Change (7d)",
        getChangePercentage(
          price_change_percentage_7d_in_currency.usd
        ),
        true
      )

    const chart = await renderHistoricalMarketChart({
      msg,
      id: coin.id,
      currency,
    })

    const getDropdownOptionDescription = (daysAgo: number) =>
      `${Defi.getDateStr(
        dayjs().subtract(daysAgo, "day").unix() * 1000
      )} - ${Defi.getDateStr(dayjs().unix() * 1000)}`
    const selectRow = composeDiscordSelectionRow({
      customId: "ticker_view_option",
      placeholder: "Make a selection",
      options: [
        {
          label: "1 day",
          value: `${coin.id}_${currency}_1`,
          emoji: "🕒",
          description: getDropdownOptionDescription(1),
        },
        {
          label: "7 days",
          value: `${coin.id}_${currency}_7`,
          emoji: "📆",
          default: true,
          description: getDropdownOptionDescription(7),
        },
        {
          label: "30 days",
          value: `${coin.id}_${currency}_30`,
          emoji: "📆",
          description: getDropdownOptionDescription(30),
        },
        {
          label: "60 days",
          value: `${coin.id}_${currency}_60`,
          emoji: "📆",
          description: getDropdownOptionDescription(60),
        },
        {
          label: "90 days",
          value: `${coin.id}_${currency}_90`,
          emoji: "📆",
          description: getDropdownOptionDescription(90),
        },
        {
          label: "1 year",
          value: `${coin.id}_${currency}_365`,
          emoji: "📆",
          description: getDropdownOptionDescription(365),
        },
      ],
    })

    const exitBtnRow = composeDiscordExitButton()

    return {
      messageOptions: {
        files: [chart],
        embeds: [embedMsg],
        components: [selectRow, exitBtnRow],
        content: getHeader("View historical market chart", msg.author),
      },
      commandChoiceOptions: {
        userId: msg.author.id,
        guildId: msg.guildId,
        channelId: msg.channelId,
        timeout: this.inactivityTimeout,
        handler,
      },
    }
  },
  getHelpMessage: async (msg) => {
    const embedMsg = composeEmbedMessage(msg, {
      thumbnail: thumbnails.TOKENS,
      description: `\`\`\`Display coin price and market cap.\nData is fetched from [CoinGecko](https://coingecko.com/)\`\`\``,
    })
      .addField("_Usage_", `\`${PREFIX}ticker <token>\``)
      .addField(
        "_Examples_",
        `\`${PREFIX}ticker fantom\` or \`${PREFIX}ticker ftm\``
      )
    return { embeds: [embedMsg] }
  },
  alias: ["tick"],
  canRunWithoutAction: true,
  isComplexCommand: true,
}

export default command
