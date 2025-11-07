import { Argv, Context, Dict, escapeRegExp, h, isNullable, Schema, Token } from 'koishi'

export const name = 'command'

declare module 'koishi' {
  interface Context {
    $tokenizer: Tokenizer
  }

  interface Token {
    raw?: string
  }

  interface Argv {
    inline?: boolean
  }

  namespace Argv {
    let defaultTokenizer: Tokenizer
  }
}

export interface Config {
  provideTokenizerService: boolean
  enableInterpolation: boolean
  enableANSICQuoting: boolean
}

export const Config: Schema<Config> = Schema.object({
  provideTokenizerService: Schema.boolean().default(true),
  enableInterpolation: Schema.boolean().default(true),
  enableANSICQuoting: Schema.boolean().default(true),
})

let oldArgv: typeof Argv & {
  defaultTokenizer: Argv.Tokenizer
}

const whitespace = Argv.whitespace

export class Tokenizer {
  subcontexts: Dict<Tokenizer.Context> = Object.create(null)
  parsers: Tokenizer.Parser[] = []

  setDefaultTokenizer(tokenizer: Tokenizer) {
    const oldTokenizer = Argv.defaultTokenizer
    Argv.defaultTokenizer = tokenizer as any
    return () => {
      Argv.defaultTokenizer = oldTokenizer
    }
  }

  define(pattern: Tokenizer.Definition) {
    if (typeof pattern.depend === 'string') {
      pattern.depend = [pattern.depend]
    }

    const c = this.subcontexts[pattern.initiator]
    if (c && (c.terminator !== pattern.terminator || c.inherit !== pattern.inherit)) {
      throw new Error(`Context for initiator "${pattern.initiator}" already exists.`)
    } else {
      this.subcontexts[pattern.initiator] = {
        terminator: pattern.terminator,
        inherit: pattern.inherit,
        quoted: pattern.quoted ?? true,
      }
    }

    const p = this.parsers.find(p => p.initiator === pattern.initiator && pattern.depend.includes(p.depend))
    if (p) {
      throw new Error(`Parser for initiator "${p.initiator}" and depend "${p.depend}" already exists.`)
    }

    if (!isNullable(pattern.depend)) {
      pattern.depend.forEach(depend => {
        this.parsers.push({
          initiator: pattern.initiator,
          depend,
          parse: pattern.parse,
        })
      })
    }
  }

  lookup(initiator: string): Tokenizer.Parser[] {
    const inherits = [initiator]
    while (!isNullable(this.subcontexts[initiator]?.inherit)) {
      initiator = this.subcontexts[initiator].inherit
      inherits.push(initiator)
    }
    return this.parsers.filter(p => inherits.includes(p.depend))
  }

  interpolate(initiator: string, terminator: string, parse?: (source: string) => Argv) {
    this.define({
      initiator,
      terminator,
      parse,
      depend: '',
    })
  }

  inline(argv: Argv) {
    const token: Token = { content: '', raw: '', inters: [], quoted: false, terminator: '' }
    for (const t of argv.tokens) {
      token.content += (token.terminator ?? '') + t.content
      token.raw += (token.terminator ?? '') + (t.raw ?? t.content)
      const offset = token.content.length
      for (const inter of t.inters) {
        token.inters.push({
          ...inter,
          pos: inter.pos + offset,
        })
      }
      token.terminator = t.terminator
    }
    return token
  }

  wrapToken(token: Token): Token {
    return new Proxy(token, {
      set(target, prop, value) {
        if (prop === 'content') {
          target.raw = value
        }
        target[prop] = value
        return true
      },
    })
  }

  parseToken(source: string, stopReg = '$', contextInitiator: string = ''): Token {
    const parent = { inters: [] } as Token
    const context = this.subcontexts[contextInitiator]
    if (!context) throw new Error(`No content defined for initiator "${contextInitiator}"`)
    let content = '', raw = ''
    if (context.terminator) {
      stopReg += `|${escapeRegExp(context.terminator)}`
    }
    const parsers = this.lookup(contextInitiator)
    if (parsers.length) {
      stopReg += `|${Object.values(parsers).map(({ initiator }) => escapeRegExp(initiator)).join('|')}`
    }
    const regExp = new RegExp(stopReg)
    while (true) {
      const capture = regExp.exec(source)
      content += whitespace.unescape(source.slice(0, capture.index))
      const parser = parsers.find(sp => sp.initiator === capture[0])

      if (parser && capture[0] !== context.terminator) {
        raw += source.slice(0, capture.index)
        source = source.slice(capture.index + capture[0].length)
        const terminator = this.subcontexts[parser.initiator].terminator
        const argv = parser.parse?.(source) || this.parse(source, terminator, /\s+/, parser.initiator)
        source = argv.rest
        if (argv.inline) {
          const token = this.inline(argv)
          parent.inters.push(...token.inters.map(inter => ({
            ...inter,
            pos: inter.pos + content.length,
          })))
          content += token.content
          raw += parser.initiator + token.raw + (token.terminator === terminator ? terminator : '')
        } else if (argv.tokens?.length) {
          parent.inters.push({ ...argv, pos: content.length, initiator: parser.initiator })
        }
      } else {
        parent.rest = source.slice(capture.index + capture[0].length)
        parent.quoted = capture[0] === context.terminator ? context.quoted : false
        parent.terminator = capture[0]
        parent.content = content
        parent.raw = raw + source.slice(0, capture.index)
        return parent
      }
    }
  }

  parse(source: string, terminator: string | RegExp = '', delimiter: string | RegExp = /\s+/, content: string = ''): Argv {
    const tokens: Token[] = []
    source = h.parse(source).map((el) => {
      return el.type === 'text' ? el.toString() : whitespace.escape(el.toString())
    }).join('')
    let rest = source, term = ''
    const terminatorReg = typeof terminator === 'string' ? `[${escapeRegExp(terminator)}]` : terminator.source
    const terminatorRegExp = new RegExp(`^(${terminatorReg})`)
    const delimiterReg = typeof delimiter === 'string' ? `[${escapeRegExp(delimiter)}]` : delimiter.source
    const stopReg = `${delimiter ? `${delimiterReg}|` : ''}${terminator ? `${terminatorReg}|` : ''}$`

    // eslint-disable-next-line no-unmodified-loop-condition
    while (rest && !(terminator && (terminatorRegExp.exec(rest) || terminatorRegExp.exec(term)))) {
      const token = this.parseToken(rest, stopReg, content)
      rest = token.rest
      term = token.terminator
      delete token.rest

      if (token.inters?.length || token.content) {
        tokens.push(token)
      }
    }

    if (terminator && !terminatorRegExp.exec(term) && terminatorRegExp.exec(rest)) {
      const capture = terminatorRegExp.exec(rest)
      rest = rest.slice(capture[0].length)
    }

    rest = whitespace.unescape(rest)
    return { tokens: tokens.map(token => this.wrapToken(token)), rest }
  }

  stringify(argv: Argv) {
    let terminator = ''
    const output = argv.tokens.reduce((prev, token) => {
      terminator = token.terminator ?? ''
      return prev + (token.raw ?? token.content) + (token.terminator ?? '')
    }, '')
    return argv.initiator ? output.slice(0, -terminator.length) : output
  }
}

export namespace Tokenizer {
  export interface Context {
    terminator: string
    inherit?: string
    quoted?: boolean
  }

  export interface Parser {
    initiator: string
    depend?: string
    parse?: (source: string) => Argv
  }

  export interface Definition {
    initiator: string
    terminator?: string
    inherit?: string
    quoted?: boolean
    depend?: string | string[]
    parse?: (source: string) => Argv
  }

  export let defaultConfig: Config

  export function setupDefaultTokenizer(tokenizer: Tokenizer) {
    tokenizer.define({
      initiator: '',
      terminator: '',
      quoted: false,
    })

    tokenizer.define({
      initiator: `"`,
      terminator: `"`,
      depend: '',
      parse(source: string) {
        const argv = tokenizer.parse(source, `"`, '', `"`)
        return {
          inline: true,
          ...argv,
        }
      },
    })

    tokenizer.define({
      initiator: `'`,
      terminator: `'`,
      depend: '',
      parse(source: string) {
        const argv = tokenizer.parse(source, `'`, '', `'`)
        return {
          inline: true,
          ...argv,
        }
      },
    })

    if (defaultConfig.enableInterpolation) {
      tokenizer.define({
        initiator: '$(',
        terminator: ')',
        inherit: '',
        quoted: false,
        depend: ['', '"'],
      })
    }

    tokenizer.define({
      initiator: '\\',
      terminator: '',
      depend: '',
      parse(source: string) {
        if (!source.length) {
          return {
            error: 'No character follows backslash',
            rest: source,
          }
        } else {
          return {
            tokens: [{ content: source[0], inters: [], quoted: false, terminator: '' }],
            rest: source.slice(1),
            inline: true,
          }
        }
      },
    })

    tokenizer.define({
      initiator: '\\',
      terminator: '',
      depend: '"',
      parse(source: string) {
        const allowedCharacters = `$\`"\\`
        if (!source.length) {
          return {
            error: 'No character follows backslash',
            rest: source,
          }
        } else if (allowedCharacters.includes(source[0])) {
          return {
            tokens: [{ content: source[0], inters: [], quoted: false, terminator: '' }],
            rest: source.slice(1),
            inline: true,
          }
        } else {
          return {
            tokens: [{ content: `\\`, inters: [], quoted: false, terminator: '' }],
            rest: source,
            inline: true,
          }
        }
      },
    })

    if (defaultConfig.enableANSICQuoting) {
      tokenizer.define({
        initiator: `$'`,
        terminator: `'`,
        depend: '',
        parse(source: string) {
          const argv = tokenizer.parse(source, `'`, '', `$'`)
          return {
            inline: true,
            ...argv,
          }
        },
      })

      tokenizer.define({
        initiator: '\\',
        terminator: '',
        depend: `$'`,
        parse(source: string) {
          if (!source.length) {
            return {
              error: 'No character follows backslash',
              rest: source,
            }
          }
          let content: string

          switch (source[0]) {
            case 'a': content = '\x07'; break
            case 'b': content = '\b'; break
            case 'e':
            case 'E': content = '\x1B'; break
            case 'f': content = '\f'; break
            case 'n': content = '\n'; break
            case 'r': content = '\r'; break
            case 't': content = '\t'; break
            case 'v': content = '\v'; break
            case '\\': content = '\\'; break
            case '\'': content = '\''; break
            case '"': content = '"'; break
            case '?': content = '?'; break
            case 'x':
              if (source.length >= 2) {
                const match = /^x[0-9A-Fa-f]{1,2}/.exec(source)!
                content = String.fromCharCode(parseInt(match[0].slice(1), 16))
                source = source.slice(match[0].length - 1)
              }
              break
            case 'u':
              if (source.length >= 5) {
                const match = /^u[0-9A-Fa-f]{4}/.exec(source)!
                content = String.fromCharCode(parseInt(match[0].slice(1), 16))
                source = source.slice(match[0].length - 1)
              }
              break
            case 'U':
              if (source.length >= 9) {
                const match = /^U[0-9A-Fa-f]{8}/.exec(source)!
                const codePoint = parseInt(match[0].slice(1), 16)
                content = String.fromCodePoint(codePoint)
                source = source.slice(match[0].length - 1)
              }
              break
            case 'c':
              if (source.length >= 2) {
                const charCode = source.charCodeAt(1)
                if ((charCode >= 64 && charCode <= 95) || (charCode >= 96 && charCode <= 127)) {
                  content = String.fromCharCode(charCode % 32)
                  source = source.slice(1)
                } else {
                  content = 'c'
                }
              } else {
                content = 'c'
              }
              break
            default:
              if (/[0-7]/.test(source[0])) {
                const match = /^[0-7]{1,3}/.exec(source)!
                content = String.fromCharCode(parseInt(match[0], 8))
                source = source.slice(match[0].length - 1)
              }
          }
          if (content) {
            return {
              tokens: [{ content, inters: [], quoted: false, terminator: '' }],
              rest: source.slice(1),
              inline: true,
            }
          } else {
            return {
              tokens: [{ content: '\\', inters: [], quoted: false, terminator: '' }],
              rest: source,
              inline: true,
            }
          }
        },
      })
    }
  }
}

export function apply(ctx: Context, config: Config) {
  ctx.effect(() => {
    oldArgv = {
      parse: Argv.parse,
      stringify: Argv.stringify,
      Tokenizer: Argv.Tokenizer,
      defaultTokenizer: Argv.defaultTokenizer,
    } as any

    const tokenizer = new Tokenizer()
    Tokenizer.defaultConfig = config
    Tokenizer.setupDefaultTokenizer(tokenizer)

    Argv.parse = function parse(source: string, terminator = '', delimiter = /\s+/, contentInitiator = '') {
      return tokenizer.parse(source, terminator, delimiter, contentInitiator)
    }

    Argv.stringify = function stringify(argv: Argv) {
      return tokenizer.stringify(argv)
    }

    Argv.Tokenizer = Tokenizer as any

    Argv.defaultTokenizer = tokenizer as any

    if (config.provideTokenizerService) {
      ctx.set('$tokenizer', tokenizer)
    }

    return () => {
      Argv.parse = oldArgv.parse
      Argv.stringify = oldArgv.stringify
      Argv.Tokenizer = oldArgv.Tokenizer
      Argv.defaultTokenizer = oldArgv.defaultTokenizer
    }
  })
}
