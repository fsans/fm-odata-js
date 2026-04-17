export interface FmConfig {
  host: string
  database: string
  user: string
  password: string
  live: boolean
  insecureTls: boolean
  tables: {
    contact: string
    address: string
    email: string
    phone: string
  }
}

export function loadEnvFile(path?: string): Record<string, string>
export function loadFmConfig(): FmConfig
