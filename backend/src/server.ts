import { loadConfig } from './config.js'
import { createContainer } from './container.js'
import { migrate } from './storage/migrate.js'

const config = loadConfig()
const { app, db } = await createContainer(config, { logger: { level: process.env.LOG_LEVEL ?? 'info' } })
await migrate(db)
await app.listen({ port: config.port, host: config.host })
app.log.info(`Translation provider: fake (simulated). Identity: dev tokens (simulated).`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0))
  })
}
