import { App } from 'koishi'
import mock from '@koishijs/plugin-mock'
import * as _command from '../src'

describe('Session API', () => {
  describe('Command Execution', () => {
    const app = new App()
    const fork = app.plugin(mock, { selfId: '123' })
    const client = app.mock.client('456')

    app.plugin(_command)

    app.command('echo [content:text]').action((_, text) => text)
    app.command('exec [command:text]').action(({ session }, text) => session!.execute(text))

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
  })
})
