import '@/styles/globals.css'
import { ConnectKitProvider, getDefaultClient } from 'connectkit'
import { Toaster } from 'react-hot-toast'
import { WagmiConfig, createClient } from 'wagmi'
import type { AppProps } from 'next/app'

const alchemyId = process.env.ALCHEMY_API_KEY

const client = createClient(
  getDefaultClient({
    appName: 'Lens Claim Site',
    alchemyId,
  })
)

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WagmiConfig client={client}>
      <ConnectKitProvider>
        <Component {...pageProps} />
        <Toaster />
      </ConnectKitProvider>
    </WagmiConfig>
  )
}
