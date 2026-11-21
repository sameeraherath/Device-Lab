// Side panel entry: mounts the Device Lab controls.
import { render } from 'preact';
import { SidePanel } from '@/components/SidePanel';
import './style.css';

render(<SidePanel />, document.getElementById('app') as HTMLElement);
