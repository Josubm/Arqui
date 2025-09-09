class Notifier{send(){throw new Error('implement')}} 
export class ConsoleNotifier extends Notifier{send(payload){console.log('Notify:',payload);return true}}
export class SilentNotifier extends Notifier{send(_){return true}}
export function getNotifier(kind){if(kind==='silent')return new SilentNotifier();return new ConsoleNotifier()}
