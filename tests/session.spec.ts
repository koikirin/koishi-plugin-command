import { App, h } from 'koishi'
import mock from '@koishijs/plugin-mock'
import * as _command from '../src'

describe('session', () => {
  const app = new App()
  const fork = app.plugin(mock, { selfId: '123' })
  const client = app.mock.client('456')

  app.plugin(_command, {
    enablePiping: true,
  })

  app.command('echo [content:text]').action((_, text) => text)
  app.command('exec [command:text]').action(({ session }, text) => session!.execute(text))
  app.command('sum <...nums:number>').action((_, ...nums: number[]) => `${nums.reduce((a, b) => a + b, 0)}`)

  before(() => app.start())
  after(() => {
    fork.dispose()
    app.stop()
  })

  it('basic support', async () => {
    await client.shouldReply('echo 0', '0')
    await client.shouldReply('exec echo 0', '0')
  })

  it('interpolate 1', async () => {
    await client.shouldReply('echo $(echo 0)', '0')
    await client.shouldReply('echo $(exec echo 0)', '0')
    await client.shouldReply('echo 1$(echo 0)2', '102')
    await client.shouldReply('echo 1 $(echo 0)  2', '1 0  2')
  })

  it('interpolate 2', async () => {
    await client.shouldReply('echo $(echo $(echo 0))', '0')
    await client.shouldReply('echo 1 $(echo $(echo 0))2', '1 02')
  })

  it('element', async () => {
    const fragment = [
      h.text('test'),
      h.at('test', { name: 'test' }),
      h.image('http://example.com/a.png'),
    ]
    const fstr = fragment.map(el => el.toString()).join('')
    await client.shouldReply(`echo ${fstr}`, fstr)
  })

  it('pipe', async () => {
    await client.shouldReply('echo 1 | sum 2', '3')
    await client.shouldReply('sum 1 2 | sum 4', '7')
    await client.shouldReply('echo 1 | sum 2 | sum 3', '6')
    await client.shouldReply('sum 1 2 | sum 4 | sum 6', '13')
  })

  it('pipe with interpolate', async () => {
    await client.shouldReply('sum 1 2 | sum $(echo 3)', '6')
    await client.shouldReply('echo 1 | sum $(echo $(echo 2))', '3')
  })

  it('pipe in interpolate', async () => {
    await client.shouldReply('echo $(echo 1 | sum 2)', '3')
    await client.shouldReply('echo $(sum 1 2 | sum 4)', '7')
    await client.shouldReply('echo $(sum 1 2 | sum $(echo 3))', '6')
  })
})
