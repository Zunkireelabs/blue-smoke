/**
 * §4.6 lockCommand frame encoding (commandId | counter | payload | tag) and
 * the AES-128-CMAC tag computed over it.
 *
 * Stub for P0-4.0. Implementation lands in P3-2.0.
 */

import type { CommandId, ResultCode } from './protocol';

export interface CommandOutcome {
  commandId: CommandId;
  resultCode: ResultCode;
  counterLow16: number;
}

export interface CommandSender {
  send(commandId: CommandId, payload?: Uint8Array): Promise<CommandOutcome>;
}

export function createCommandSender(): CommandSender {
  throw new Error('P3-2.0');
}
