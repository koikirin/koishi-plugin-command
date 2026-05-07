# @hieuzest/koishi-plugin-command

[![npm](https://img.shields.io/npm/v/@hieuzest/koishi-plugin-command?style=flat-square)](https://www.npmjs.com/package/@hieuzest/koishi-plugin-command)

A Plug-in command tokenizer substitute for Koishi v4 with Bash style quoting.

- Escape Character

  Bash-style backslash escaping (e.g. `\n`, `\t`, `\\`)

- Single Quotes

  Preserves literal value of all characters within the quotes

- Double Quotes

  Preserves literal value but allows `$()` interpolation

- ANSI-C Quoting

  `$'...'` syntax with support for escape sequences

- Pipelines

  `a | b` passes the output of command `a` as input to command `b`
