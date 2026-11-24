/**
 * text-encoding 是纯 JS 的 WHATWG Encoding polyfill，自身不带类型声明。
 * 这里只声明本项目用到的 TextDecoder。
 */
declare module 'text-encoding' {
  export class TextDecoder {
    constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
    readonly encoding: string;
    readonly fatal: boolean;
    decode(input?: ArrayBuffer | ArrayBufferView, options?: { stream?: boolean }): string;
  }

  export class TextEncoder {
    readonly encoding: string;
    encode(input?: string): Uint8Array;
  }
}
