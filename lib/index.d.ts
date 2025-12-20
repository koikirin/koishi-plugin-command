import { Argv, Context, Dict, Schema, Token } from 'koishi';
export declare const name = "command";
declare module 'koishi' {
    interface Context {
        $tokenizer: Tokenizer;
    }
    interface Token {
        raw?: string;
    }
    interface Argv {
        inline?: true | false | 'plain' | 'strip';
    }
    namespace Argv {
        let defaultTokenizer: Tokenizer;
    }
}
export interface Config {
    provideTokenizerService: boolean;
    enableInterpolation: boolean;
    enableBackslashEscaping: boolean;
    enableANSICQuoting: boolean;
}
export declare const Config: Schema<Config>;
export declare class Tokenizer {
    contexts: Dict<Tokenizer.Context>;
    parsers: Tokenizer.Parser[];
    setDefaultTokenizer(tokenizer: Tokenizer): () => void;
    define(pattern: Tokenizer.Definition): void;
    lookup(context: string): (Tokenizer.Parser)[];
    interpolate(initiator: string, terminator: string, parse?: (source: string) => Argv): void;
    inline(argv: Argv): Token;
    wrapToken(token: Token): Token;
    parseToken(source: string, stopReg?: string, context?: string): Token;
    parse(source: string, terminator?: string | RegExp, delimiter?: string | RegExp, context?: string): Argv;
    stringify(argv: Argv): string;
}
export declare namespace Tokenizer {
    interface Context {
        initiator: string;
        terminator: string;
        inherit?: string;
        quoted?: boolean;
    }
    interface Parser {
        context: string;
        depend?: string;
        parse?: (source: string) => Argv;
        initiator: string;
        initiatorReg: string;
    }
    interface Definition {
        id?: string;
        initiator?: string;
        terminator?: string;
        inherit?: string;
        quoted?: boolean;
        depend?: string | string[];
        parse?: (source: string) => Argv;
    }
    let defaultConfig: Config;
    function setupElementTokenizer(tokenizer: Tokenizer): void;
    function setupDefaultTokenizer(tokenizer: Tokenizer): void;
}
export declare function apply(ctx: Context, config: Config): void;
