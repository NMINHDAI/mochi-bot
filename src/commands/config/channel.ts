import { Command } from "types/common"
import { workInProgress } from "utils/discord-embed"

const command: Command = {
  id: "channel",
  name: "Setup channels to receive notifications",
  command: "channel",
  alias: ["chan", "chans", "channels"],
  category: "Config",
  canRunWithoutAction: true,
  run: async (msg) => ({
    messageOptions: await workInProgress(msg),
  }),
  getHelpMessage: workInProgress,
  experimental: true,
}

export default command
