import { App, Argv, h } from 'koishi'
import { expect } from 'chai'
import * as _command from '../src'

describe('command', () => {
  const app = new App()

  before(() => {
    app.plugin(_command, {
      enablePipeline: true,
    })
  })
  after(() => app.stop())

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

  const identity = (source: string) => Argv.stringify(Argv.parse(source))
  // @ts-expect-error
  const identityInter = (source: string) => Argv.stringify(Argv.parse(source), true)

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

    expect(identityInter('$()')).to.equal('$()')
    expect(identityInter('a $(  ) b')).to.equal('a $() b')
    expect(identityInter('$(echo $(echo 1))')).to.equal('$(echo $(echo 1))')
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

  it('quoted identity', async () => {
    const test = (x: string) => expect(identity(x)).to.equal(x)
    test(`a "b\\ c\\"\\$\\\\\\\`"`)
    test(`a 'b\\ c'`)
    test(`a 'b\\ c\\r' 'd\\\\'`)
    test(`a $'\\ \\a\\b\\e\\E\\f\\n\\r\\t\\v'`)
    test(`a $'\\ \\\\\\'\\"\\012\\xAA\\u2001\\U0001F600'`)

    // dquote fallback: non-escapeable char after backslash
    test(`a "b\\Xc"`)

    // ANSI-C fallback: unrecognized escape
    test(`a $'\\Xbc'`)

    // individual ANSI-C escapes raw integrity
    const check = (source: string, content: string, raw: string) => {
      const token = Argv.parse(source).tokens![0]
      expect(token.content).to.equal(content)
      expect(token.raw).to.equal(raw)
      expect(identity(source)).to.equal(source)
    }

    check(`$'\\n'`, '\n', `$'\\n'`)
    check(`$'\\t'`, '\t', `$'\\t'`)
    check(`$'\\r'`, '\r', `$'\\r'`)
    check(`$'\\\\'`, '\\', `$'\\\\'`)
    check(`$'\\''`, '\'', `$'\\''`)
    check(`$'\\"'`, '"', `$'\\"'`)
    check(`$'\\x41'`, 'A', `$'\\x41'`)
    check(`$'\\u4e00'`, '\u4e00', `$'\\u4e00'`)
    check(`$'\\012'`, '\x0A', `$'\\012'`)
  })

  it('empty quoted', async () => {
    expect(parse('""')).to.deep.equal([''])
    expect(parse("''")).to.deep.equal([''])
    expect(parse("$''")).to.deep.equal([''])
    expect(parse('echo ""')).to.deep.equal(['echo', ''])
    expect(parse('echo "" ""')).to.deep.equal(['echo', '', ''])
    expect(parse("echo '' ''")).to.deep.equal(['echo', '', ''])
    expect(parse("echo $''")).to.deep.equal(['echo', ''])
    expect(parse('"" echo ""')).to.deep.equal(['', 'echo', ''])
    expect(parse('"a" "" "b"')).to.deep.equal(['a', '', 'b'])

    expect(identity('""')).to.equal('""')
    expect(identity("''")).to.equal("''")
    expect(identity("$''")).to.equal("$''")
    expect(identity('echo ""')).to.equal('echo ""')
    expect(identity('"" ""')).to.equal('"" ""')
  })

  it('stringify', async () => {
    expect(Argv.stringify(Argv.parse(`"x" $(echo 1)`).tokens![1].inters[0])).to.equal(`echo 1`)

    const test = (x: string, y?: string) => expect(Argv.stringify(Argv.parse(x))).to.deep.equal(y ?? x)
    test(`x y z`)
    test(`x "yy" 'zz'`)
    test(`x "yy" 'zz' $(aa)`, `x "yy" 'zz' `)
    test(`$(1)`, '')
    test(`$( 1 2 3   )`, '')
    test(`" a $(123) b $(456) c "`, `" a  b  c "`)
  })

  it('identity', async () => {
    const cmd = app.command('h <content:text>')
    const test = (x: string, y?: string) => expect(cmd.parse(x).args).to.deep.equal([y ?? x])
    test(`x y z`)
    test(`x "yy" 'zz'`)
    test(`x "yy" 'zz' $(aa)`, `x "yy" 'zz' `)
    test(`$(1)`, '')
    test(`$( 1 2 3   )`, '')
    test(`" a $(123) b $(456) c "`, `" a  b  c "`)
    cmd.dispose()
  })

  it('unclosed', async () => {
    expect(identity('a "1')).to.deep.equal('a "1')
    expect(identity(`"aa'55`)).to.deep.equal(`"aa'55`)
    expect(identity('</aa>')).to.deep.equal('</aa>')
    expect(identity('<aa>xx<')).to.deep.equal('<aa>xx<')
  })

  it('interpolate identity', async () => {
    const test = (x: string, y?: string) => expect(identityInter(x)).to.equal(y ?? x)
    test(`b $(a ) `)
    test(`b $(a)`)
    test(`b $()`)
    test(`b $(a`)
    test(`b $(`)
  })

  it('trim', async () => {
    expect(parse(' a ')).to.deep.equal(['a'])
    expect(parseInter(' $( a ) ')).to.deep.equal([[''], ['a']])
    expect(parseInter(' " $( a ) " ')).to.deep.equal([['  '], ['a']])
  })

  it('element', async () => {
    const cmd = app.command('h <content:el>')
    const test = (x: string, y?: string) => {
      expect(identity(x)).to.equal(y ?? x)
      expect(cmd.parse(x).args).to.deep.equal([h.parse(y ?? x)])
    }
    test(`<div> test </div>`)
    test(`<div class="a b" id='test'> test </div>`)
    test(`<div> te' "st </div>`)
    test(`<div> test $(x)<img src="</aa> <bb>"> </ img > </div>`)
    test(`a <at id="114" name="5\\14"/>`)
    cmd.dispose()
  })

  it('pipe', async () => {
    expect(identityInter('a 1| b 2')).to.equal('b 2 $(a 1)')
    expect(identityInter('a 1 | b 2')).to.equal('b 2 $(a 1 )')
    expect(identityInter('b 2 $(a 1)')).to.equal('b 2 $(a 1)')
    expect(identityInter('sum 1 2 | sum 3 | echo')).to.equal('echo $(sum 3 $(sum 1 2 ))')
    expect(identityInter('echo $(echo 1 | sum 2)')).to.equal('echo $(sum 2 $(echo 1 ))')
    expect(identityInter('sum 1 2 | sum $(echo 3)')).to.equal('sum $(echo 3) $(sum 1 2 )')
    expect(identityInter('echo $(sum 1 2 | sum $(echo 3))')).to.equal('echo $(sum $(echo 3) $(sum 1 2 ))')
    expect(identityInter('echo "a b" | sum 1')).to.equal('sum 1 $(echo "a b" )')
    expect(identityInter('echo \\n | sum 1')).to.equal('sum 1 $(echo \\n )')
  })

  it('performance', async () => {
    for (let i = 0; i < 10000; i++) {
      Argv.parse(`command arg1 arg2 arg3 arg4 arg5 arg6 arg7 arg8 arg9 arg10`)
    }
  })

  it('performance2', async () => {
    for (let i = 0; i < 10000; i++) {
      Argv.parse(`command "arg1" 'arg2' arg3 \\$arg4 $(echo arg5) arg6`)
    }
  })
})
