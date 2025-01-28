export interface ISuperformsMessage {
    type?: 'success' | 'general' | 'info' | 'warning' | 'error';
    text?: string;
    step?: number;
}
