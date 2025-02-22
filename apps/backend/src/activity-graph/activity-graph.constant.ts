import { NodeLabelEnum } from './node-label.enum.js';

export const allActivityTypes = Object.entries(NodeLabelEnum)
    .filter(([key]) => key.startsWith('ACTIVITY'))
    .map(([key, value]) => value);
