var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Config: () => Config,
  Tokenizer: () => Tokenizer,
  apply: () => apply,
  name: () => name
});
module.exports = __toCommonJS(src_exports);
var import_koishi = require("koishi");
var name = "command";
var Config = import_koishi.Schema.object({
  provideTokenizerService: import_koishi.Schema.boolean().default(true),
  enableInterpolation: import_koishi.Schema.boolean().default(true),
  enableBackslashEscaping: import_koishi.Schema.boolean().default(true),
  enableANSICQuoting: import_koishi.Schema.boolean().default(true)
});
var oldArgv;
var Tokenizer = class {
  static {
    __name(this, "Tokenizer");
  }
  contexts = /* @__PURE__ */ Object.create(null);
  parsers = [];
  setDefaultTokenizer(tokenizer) {
    const oldTokenizer = import_koishi.Argv.defaultTokenizer;
    import_koishi.Argv.defaultTokenizer = tokenizer;
    return () => {
      import_koishi.Argv.defaultTokenizer = oldTokenizer;
    };
  }
  define(pattern) {
    if (typeof pattern.depend === "string") pattern.depend = [pattern.depend];
    if ((0, import_koishi.isNullable)(pattern.id)) pattern.id = pattern.initiator;
    const c = this.contexts[pattern.id];
    if (c && (c.terminator !== pattern.terminator || c.inherit !== pattern.inherit)) {
      throw new Error(`Context "${pattern.id}" already exists.`);
    } else {
      this.contexts[pattern.id] = {
        initiator: pattern.initiator,
        terminator: pattern.terminator,
        inherit: pattern.inherit,
        quoted: pattern.quoted ?? true
      };
    }
    const p = this.parsers.find((p2) => p2.context === pattern.id && pattern.depend.includes(p2.depend));
    if (p) {
      throw new Error(`Parser for context "${p.context}" and depend "${p.depend}" already exists.`);
    }
    if (!(0, import_koishi.isNullable)(pattern.depend)) {
      pattern.depend.forEach((depend) => {
        this.parsers.push({
          context: pattern.id,
          depend,
          parse: pattern.parse,
          initiator: pattern.initiator,
          initiatorReg: (0, import_koishi.escapeRegExp)(pattern.initiator)
        });
      });
    }
  }
  lookup(context) {
    const inherits = [context];
    while (!(0, import_koishi.isNullable)(this.contexts[context]?.inherit)) {
      context = this.contexts[context].inherit;
      inherits.push(context);
    }
    return this.parsers.filter((p) => inherits.includes(p.depend));
  }
  interpolate(initiator, terminator, parse) {
    this.define({
      initiator,
      terminator,
      parse,
      depend: ""
    });
  }
  inline(argv) {
    const token = { content: "", raw: "", inters: [], quoted: false, terminator: "" };
    for (const t of argv.tokens) {
      token.content += (token.terminator ?? "") + t.content;
      token.raw += (token.terminator ?? "") + (t.raw ?? t.content);
      const offset = token.content.length;
      for (const inter of t.inters) {
        token.inters.push({
          ...inter,
          pos: inter.pos + offset
        });
      }
      token.terminator = t.terminator;
    }
    return token;
  }
  wrapToken(token) {
    return new Proxy(token, {
      set(target, prop, value) {
        if (prop === "content") {
          target.raw = value;
        }
        target[prop] = value;
        return true;
      }
    });
  }
  parseToken(source, stopReg = "$", context = "") {
    const parent = { inters: [] };
    const ctx = this.contexts[context];
    let content = "", raw = "";
    if (ctx?.terminator) {
      stopReg += `|${(0, import_koishi.escapeRegExp)(ctx.terminator)}`;
    }
    const parsers = this.lookup(context);
    if (parsers.length) {
      stopReg += `|${Object.values(parsers).map(({ initiatorReg }) => initiatorReg).join("|")}`;
    }
    const regExp = new RegExp(stopReg);
    while (true) {
      const capture = regExp.exec(source);
      content += source.slice(0, capture.index);
      const parser = parsers.find((sp) => sp.initiator === capture[0]);
      if (parser && capture[0] !== ctx.terminator) {
        raw += source.slice(0, capture.index);
        source = source.slice(capture.index + capture[0].length);
        const argv = parser.parse?.(source) || this.parse(source, this.contexts[capture[0]].terminator, /\s+/, capture[0]);
        source = argv.rest;
        if (argv.inline) {
          const token = this.inline(argv);
          parent.inters.push(...token.inters.map((inter) => ({
            ...inter,
            pos: inter.pos + content.length
          })));
          if (argv.inline === "plain") {
            content += capture[0] + token.content + token.terminator;
            raw += capture[0] + token.raw + token.terminator;
          } else if (argv.inline === "strip") {
            content += token.content;
            raw += token.raw;
          } else {
            content += token.content;
            raw += capture[0] + token.raw + token.terminator;
          }
        } else if (argv.tokens?.length) {
          parent.inters.push({ ...argv, pos: content.length, initiator: capture[0] });
        }
      } else {
        parent.rest = source.slice(capture.index + capture[0].length);
        parent.quoted = capture[0] === ctx?.terminator ? ctx.quoted : false;
        parent.terminator = capture[0];
        parent.content = content;
        parent.raw = raw + source.slice(0, capture.index);
        return parent;
      }
    }
  }
  parse(source, terminator = "", delimiter = /\s+/, context = "") {
    const tokens = [];
    let rest = source, term = "";
    const terminatorReg = typeof terminator === "string" ? `[${(0, import_koishi.escapeRegExp)(terminator)}]` : terminator.source;
    const terminatorRegExp = new RegExp(`^(${terminatorReg})`);
    const delimiterReg = typeof delimiter === "string" ? `[${(0, import_koishi.escapeRegExp)(delimiter)}]` : delimiter.source;
    const stopReg = `${delimiter ? `${delimiterReg}|` : ""}${terminator ? `${terminatorReg}|` : ""}$`;
    while (rest && !(terminator && (terminatorRegExp.exec(rest) || terminatorRegExp.exec(term)))) {
      const token = this.parseToken(rest, stopReg, context);
      rest = token.rest;
      term = token.terminator;
      delete token.rest;
      if (token.inters?.length || token.content) {
        tokens.push(token);
      }
    }
    if (terminator && !terminatorRegExp.exec(term) && terminatorRegExp.exec(rest)) {
      const capture = terminatorRegExp.exec(rest);
      rest = rest.slice(capture[0].length);
    }
    return { tokens: tokens.map((token) => this.wrapToken(token)), rest };
  }
  stringify(argv) {
    let terminator = "";
    const output = argv.tokens.reduce((prev, token) => {
      terminator = token.terminator ?? "";
      return prev + (token.raw ?? token.content) + (token.terminator ?? "");
    }, "");
    return argv.initiator ? output.slice(0, -terminator.length) : output;
  }
};
((Tokenizer2) => {
  function setupElementTokenizer(tokenizer) {
    tokenizer.define({
      id: "<>"
    });
    tokenizer.define({
      initiator: "</",
      terminator: ">",
      depend: "<>",
      parse(source) {
        const argv = tokenizer.parse(source, `>`, "", `</`);
        return {
          inline: "plain",
          ...argv
        };
      }
    });
    tokenizer.define({
      initiator: "<",
      terminator: ">",
      depend: ["", "<>"],
      parse(source) {
        const argv = tokenizer.parse(source, `>`, "", `<`);
        if (argv.tokens[0]?.content.endsWith("/")) {
          return {
            inline: true,
            ...argv
          };
        }
        const argv2 = tokenizer.parse(argv.rest, "", "", "<>");
        return {
          tokens: argv.tokens.concat(argv2.tokens),
          inline: "plain",
          rest: argv2.rest
        };
      }
    });
    tokenizer.define({
      id: `<"`,
      initiator: `"`,
      terminator: `"`,
      depend: "<",
      parse(source) {
        const argv = tokenizer.parse(source, `"`, "", null);
        return {
          inline: "plain",
          ...argv
        };
      }
    });
  }
  Tokenizer2.setupElementTokenizer = setupElementTokenizer;
  __name(setupElementTokenizer, "setupElementTokenizer");
  function setupDefaultTokenizer(tokenizer) {
    tokenizer.define({
      initiator: "",
      terminator: "",
      quoted: false
    });
    setupElementTokenizer(tokenizer);
    tokenizer.define({
      initiator: `"`,
      terminator: `"`,
      depend: "",
      parse(source) {
        const argv = tokenizer.parse(source, `"`, "", `"`);
        return {
          inline: true,
          ...argv
        };
      }
    });
    tokenizer.define({
      initiator: `'`,
      terminator: `'`,
      depend: "",
      parse(source) {
        const argv = tokenizer.parse(source, `'`, "", `'`);
        return {
          inline: true,
          ...argv
        };
      }
    });
    if (Tokenizer2.defaultConfig.enableInterpolation) {
      tokenizer.define({
        initiator: "$(",
        terminator: ")",
        inherit: "",
        quoted: false,
        depend: ["", '"']
      });
    }
    if (Tokenizer2.defaultConfig.enableBackslashEscaping) {
      tokenizer.define({
        initiator: "\\",
        terminator: "",
        depend: "",
        parse(source) {
          if (!source.length) {
            return {
              error: "No character follows backslash",
              rest: source
            };
          } else {
            return {
              tokens: [{ content: source[0], inters: [], quoted: false, terminator: "" }],
              rest: source.slice(1),
              inline: true
            };
          }
        }
      });
      tokenizer.define({
        initiator: "\\",
        terminator: "",
        depend: '"',
        parse(source) {
          const allowedCharacters = `$\`"\\`;
          if (!source.length) {
            return {
              error: "No character follows backslash",
              rest: source
            };
          } else if (allowedCharacters.includes(source[0])) {
            return {
              tokens: [{ content: source[0], inters: [], quoted: false, terminator: "" }],
              rest: source.slice(1),
              inline: true
            };
          } else {
            return {
              tokens: [{ content: `\\`, inters: [], quoted: false, terminator: "" }],
              rest: source,
              inline: true
            };
          }
        }
      });
    }
    if (Tokenizer2.defaultConfig.enableANSICQuoting) {
      tokenizer.define({
        initiator: `$'`,
        terminator: `'`,
        depend: "",
        parse(source) {
          const argv = tokenizer.parse(source, `'`, "", `$'`);
          return {
            inline: true,
            ...argv
          };
        }
      });
      tokenizer.define({
        initiator: "\\",
        terminator: "",
        depend: `$'`,
        parse(source) {
          if (!source.length) {
            return {
              error: "No character follows backslash",
              rest: source
            };
          }
          let content;
          switch (source[0]) {
            case "a":
              content = "\x07";
              break;
            case "b":
              content = "\b";
              break;
            case "e":
            case "E":
              content = "\x1B";
              break;
            case "f":
              content = "\f";
              break;
            case "n":
              content = "\n";
              break;
            case "r":
              content = "\r";
              break;
            case "t":
              content = "	";
              break;
            case "v":
              content = "\v";
              break;
            case "\\":
              content = "\\";
              break;
            case "'":
              content = "'";
              break;
            case '"':
              content = '"';
              break;
            case "?":
              content = "?";
              break;
            case "x":
              if (source.length >= 2) {
                const match = /^x[0-9A-Fa-f]{1,2}/.exec(source);
                content = String.fromCharCode(parseInt(match[0].slice(1), 16));
                source = source.slice(match[0].length - 1);
              }
              break;
            case "u":
              if (source.length >= 5) {
                const match = /^u[0-9A-Fa-f]{4}/.exec(source);
                content = String.fromCharCode(parseInt(match[0].slice(1), 16));
                source = source.slice(match[0].length - 1);
              }
              break;
            case "U":
              if (source.length >= 9) {
                const match = /^U[0-9A-Fa-f]{8}/.exec(source);
                const codePoint = parseInt(match[0].slice(1), 16);
                content = String.fromCodePoint(codePoint);
                source = source.slice(match[0].length - 1);
              }
              break;
            case "c":
              if (source.length >= 2) {
                const charCode = source.charCodeAt(1);
                if (charCode >= 64 && charCode <= 95 || charCode >= 96 && charCode <= 127) {
                  content = String.fromCharCode(charCode % 32);
                  source = source.slice(1);
                } else {
                  content = "c";
                }
              } else {
                content = "c";
              }
              break;
            default:
              if (/[0-7]/.test(source[0])) {
                const match = /^[0-7]{1,3}/.exec(source);
                content = String.fromCharCode(parseInt(match[0], 8));
                source = source.slice(match[0].length - 1);
              }
          }
          if (content) {
            return {
              tokens: [{ content, inters: [], quoted: false, terminator: "" }],
              rest: source.slice(1),
              inline: true
            };
          } else {
            return {
              tokens: [{ content: "\\", inters: [], quoted: false, terminator: "" }],
              rest: source,
              inline: true
            };
          }
        }
      });
    }
  }
  Tokenizer2.setupDefaultTokenizer = setupDefaultTokenizer;
  __name(setupDefaultTokenizer, "setupDefaultTokenizer");
})(Tokenizer || (Tokenizer = {}));
function apply(ctx, config) {
  ctx.effect(() => {
    oldArgv = {
      parse: import_koishi.Argv.parse,
      stringify: import_koishi.Argv.stringify,
      Tokenizer: import_koishi.Argv.Tokenizer,
      defaultTokenizer: import_koishi.Argv.defaultTokenizer
    };
    const tokenizer = new Tokenizer();
    Tokenizer.defaultConfig = config;
    Tokenizer.setupDefaultTokenizer(tokenizer);
    import_koishi.Argv.parse = /* @__PURE__ */ __name(function parse(source, terminator = "", delimiter = /\s+/, contentInitiator = "") {
      return tokenizer.parse(source, terminator, delimiter, contentInitiator);
    }, "parse");
    import_koishi.Argv.stringify = /* @__PURE__ */ __name(function stringify(argv) {
      return tokenizer.stringify(argv);
    }, "stringify");
    import_koishi.Argv.Tokenizer = Tokenizer;
    import_koishi.Argv.defaultTokenizer = tokenizer;
    if (config.provideTokenizerService) {
      ctx.set("$tokenizer", tokenizer);
    }
    return () => {
      import_koishi.Argv.parse = oldArgv.parse;
      import_koishi.Argv.stringify = oldArgv.stringify;
      import_koishi.Argv.Tokenizer = oldArgv.Tokenizer;
      import_koishi.Argv.defaultTokenizer = oldArgv.defaultTokenizer;
    };
  });
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  Tokenizer,
  apply,
  name
});
