// The colour chosen for each device: loaded once, kept in memory, saved on change.
import { finishesOf, type Device, type Finish } from './devices';
import { getFinishChoices, setFinishChoices } from './storage';
import { refresh } from './windowManager';

let choices: Record<string, string> = {};

export async function loadFinishChoices(): Promise<void> {
  choices = await getFinishChoices();
}

/** The device's chosen finish, or its default (the first, darkest one). */
export function finishFor(device: Device): Finish | undefined {
  const list = finishesOf(device);
  return list.find((f) => f.id === choices[device.id]) ?? list[0];
}

/** Picks a colour for every window showing this device, and remembers it. */
export function chooseFinish(deviceId: string, finishId: string) {
  choices = { ...choices, [deviceId]: finishId };
  refresh();
  void setFinishChoices(choices);
}
