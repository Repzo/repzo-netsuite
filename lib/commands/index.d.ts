import { Command, CommandEvent } from "../types";
export declare const commands: (
  CommandEvent: CommandEvent,
) => Promise<import("../types").Result>;
export declare const commandsList: Command[];
