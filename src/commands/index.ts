import { Command, CommandEvent } from "../types";
import { addClients } from "./client.js";
export const commands = async (CommandEvent: CommandEvent) => {
  try {
    switch (CommandEvent.command) {
      case "add_client":
        return await addClients(CommandEvent);

      default:
        throw `Route: ${CommandEvent.command} not found`;
    }
  } catch (e) {
    console.error(e);
    throw e;
  }
};

export const commandsList: Command[] = [
  {
    command: "add_client",
    name: "Sync Clients",
    description: "",
  },
];
