import { App, Argv, h } from 'koishi'
import { expect } from 'chai'
import * as _command from '../src'

describe('command', () => {
  const app = new App()

  app.plugin(_command)

  const parse = (source: string, terminator = '') => Argv.parse(source, terminator).tokens?.map(token => token.content)

  const parseInter = (source: string, terminator = '') => {
    const tokens: string[][] = []
    const collect = (argv: Argv) => {
      if (argv.tokens) {
        tokens.push(argv.tokens.map(token => token.content))
        for (const { inters } of argv.tokens) {
          inters.forEach(collect)
        }
      }
    }
    collect(Argv.parse(source, terminator))
    return tokens
  }

  const applyInter = (argv: Argv) => '[' + argv.tokens!.map((token) => {
    let content = token.content
    for (const inter of token.inters.slice().reverse()) {
      content = content.slice(0, inter.pos) + applyInter(inter) + content.slice(inter.pos)
    }
    return content
  }).join(' ') + ']'

  it('parse', async () => {
    expect(parse('a b c')).to.deep.equal(['a', 'b', 'c'])
    expect(parse('a b  c\t\r\n dd ')).to.deep.equal(['a', 'b', 'c', 'dd'])
  })

  it('interpolate', async () => {
    expect(parseInter(`a b$(xx $(yy d))c`)).to.deep.equal([['a', 'bc'], ['xx', ''], ['yy', 'd']])

    const testApply = (x: string) => expect(applyInter(Argv.parse(x))).to.equal('[' + x.replace(/\$\(/g, '[').replace(/\)/g, ']') + ']')

    testApply(`a b$(xx $(yy d))c`)
    testApply(`a b$(x y z)c`)
  })

  it('quote', async () => {
    expect(parse(`a 'b' "c"`)).to.deep.equal(['a', 'b', 'c'])
    expect(parse(`a 'b'"c"'d'`)).to.deep.equal(['a', 'bcd'])
    expect(parse(`a 'b'"c"'d'e 'f'"g" h`)).to.deep.equal(['a', 'bcde', 'fg', 'h'])
    expect(parse(`a "b"'"'"c" 'd'"'"'e'`)).to.deep.equal(['a', `b"c`, `d'e`])
    expect(parse(`f'a'"f"`)).to.deep.equal(['faf'])
    expect(parse(`'a'f "b"'s"'"c"g`)).to.deep.equal(['af', `bs"cg`])
  })

  it('backslash', async () => {
    expect(parse(`a b\\ c`)).to.deep.equal(['a', 'b c'])
    expect(parse(`a b\\ c\\r d\\\\`)).to.deep.equal(['a', 'b cr', 'd\\'])
  })

  it('quoted backslash', async () => {
    expect(parse(`a "b\\ c\\"\\$\\\\\\\`"`)).to.deep.equal(['a', 'b\\ c"$\\\`'])
    expect(parse(`a 'b\\ c'`)).to.deep.equal(['a', 'b\\ c'])
    expect(parse(`a 'b\\ c\\r' 'd\\\\'`)).to.deep.equal(['a', 'b\\ c\\r', 'd\\\\'])
    expect(parse(`a $'\\ \\a\\b\\e\\E\\f\\n\\r\\t\\v'`)).to.deep.equal([`a`, `\\ \x07\b\x1B\x1B\f\n\r\t\v`])
    expect(parse(`a $'\\ \\\\\\'\\"\\012\\xAA\\u2001\\U0001F600'`)).to.deep.equal([`a`, `\\ \\\'"\x0A\xAA\u2001${String.fromCodePoint(0x1F600)}`])
  })

  it('stringify', async () => {
    expect(Argv.stringify(Argv.parse(`"x" $(echo 1)`).tokens![1].inters[0])).to.equal(`echo 1`)

    let test = (x: string, y?: string) => expect(Argv.stringify(Argv.parse(x))).to.deep.equal(y ?? x)
    test(`x y z`)
    test(`x "yy" 'zz'`)
    test(`x "yy" 'zz' $(aa)`, `x "yy" 'zz' `)
    test(`$(1)`, '')
    test(`$( 1 2 3   )`, '')
    test(`" a $(123) b $(456) c "`, `" a  b  c "`)
  })

  it('identity', async () => {
    let cmd = app.command('h <content:text>')
    let test = (x: string, y?: string) => expect(cmd.parse(x).args).to.deep.equal([y ?? x])
    test(`x y z`)
    test(`x "yy" 'zz'`)
    test(`x "yy" 'zz' $(aa)`, `x "yy" 'zz' `)
    test(`$(1)`, '')
    test(`$( 1 2 3   )`, '')
    test(`" a $(123) b $(456) c "`, `" a  b  c "`)
    test(`a <at id="114" name="5\\14"/>`)
    cmd.dispose()
  })

  it('unclosed', async () => {
    const identity = (source: string) => Argv.stringify(Argv.parse(source))
    expect(identity('a "1')).to.deep.equal('a "1')
    expect(identity(`"aa'55`)).to.deep.equal(`"aa'55`)
  })

  it('trim', async () => {
    expect(parse(' a ')).to.deep.equal(['a'])
    expect(parseInter(' $( a ) ')).to.deep.equal([[''], ['a']])
    expect(parseInter(' " $( a ) " ')).to.deep.equal([['  '], ['a']])
  })

  it('performance', async () => {
    for (let i = 0; i < 10000; i++) {
      Argv.parse(`command arg1 arg2 arg3 arg4 arg5 arg6 arg7 arg8 arg9 arg10`)
    }
  })
})
