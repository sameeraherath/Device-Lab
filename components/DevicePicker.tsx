// Lets the user choose a device from the device list, grouped by type.
import { devices, type DeviceType } from '@/lib/devices';

const GROUPS: { type: DeviceType; label: string }[] = [
  { type: 'phone', label: 'Phones' },
  { type: 'tablet', label: 'Tablets' },
  { type: 'laptop', label: 'Laptops' },
];

interface Props {
  value: string;
  onChange: (deviceId: string) => void;
}

export function DevicePicker({ value, onChange }: Props) {
  return (
    <select
      class="picker"
      aria-label="Device"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
    >
      {GROUPS.map((group) => (
        <optgroup label={group.label} key={group.type}>
          {devices
            .filter((d) => d.type === group.type)
            .map((d) => (
              <option value={d.id} key={d.id}>
                {d.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
