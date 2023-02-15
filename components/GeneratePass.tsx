import React, { useState, useEffect } from 'react'
import { Ring, RaceBy } from '@uiball/loaders'
import { Types } from 'connectkit'
import { useAccount, useNetwork, useSigner } from 'wagmi'
import { ChainProviderFn, Provider, Chain } from '@wagmi/core'

import { useModal } from 'connectkit'
import QRCode from 'qrcode'
import DeviceDetector, { DeviceDetectorResult } from 'device-detector-js'
import Modal from './Modal'

export type GeneratePassProps = {
  settings: {
    publicKey: string
    contracts: Array<{
      chain: {
        name: string
        network: number
      }
      address: string
      slug?: string
    }>
    profile: {
      address: string
      handle: string
      name: string
      id: string
    }
    checkDuplicateWallet?: boolean
    checkDuplicateToken?: boolean
  }
  client?: {
    // An array of providers supported by your app. The default provider is wagmi's public provider.
    providers?: Array<ChainProviderFn>
    // An array of chain supported by your app. The default chains are [mainnet, polygon, optimism, arbitrum]
    chains?: Array<Chain>
  }
  theme?: Types.Theme
  className?: string
}

const GeneratePass: React.FC<GeneratePassProps> = ({
  settings: {
    publicKey,
    contracts,
    profile,
    checkDuplicateWallet = false,
    checkDuplicateToken = true,
  },
  className,
}) => {
  const [isActive, setIsActive] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [ownedNfts, setOwnedNfts] = useState<any[]>([])
  const [nft, setNft] = useState<{
    contractAddress: string | undefined
    tokenId: string | undefined
  }>({
    contractAddress: '',
    tokenId: '',
  })
  const [platform, setPlatform] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [qrCode, setQRCode] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [modal, setModal] = useState('')
  const [connectAttempt, setConnectAttempt] = useState(false)
  const [disableClose, setDisableClose] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [sig, setSig] = useState({
    signature: '',
    signatureMessage: '',
  })

  const { address, isConnected } = useAccount()
  const { data: signer } = useSigner()
  const { setOpen } = useModal() // ConnectKit modal
  const { chain } = useNetwork()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const deviceDetector = new DeviceDetector()
    const userAgent: DeviceDetectorResult = deviceDetector.parse(navigator.userAgent)
    setIsMobile(userAgent.device?.type === 'desktop' ? false : true)
  }, [])

  useEffect(() => {
    if (!address) return
  }, [address])

  useEffect(() => {
    if (isConnected && connectAttempt) {
      checkDuplicateWallet ? checkExistingPass(address) : getOwnedNfts()
      setConnectAttempt(false)
    }
  }, [isConnected])

  const checkIsConnected = () => {
    if (isConnected) {
      checkDuplicateWallet ? checkExistingPass(address) : getOwnedNfts()
    } else {
      setOpen(true)
      setConnectAttempt(true)
    }
  }

  const getOwnedNfts = async () => {
    setIsActive(true)
    setModal('Select NFT')
    setIsLoading(true)

    try {
      const OS_STOREFRONT_ADDRESS = '0x495f947276749ce646f68ac8c248420045cb7b5e'
      const openseaSlugs: string[] = []
      const contractAddresses: string[] = []
      // Get contract addresses from user input
      contracts.map((contract) => {
        // Check if contract address matches Opensea storefront
        if (contract.address === OS_STOREFRONT_ADDRESS) {
          // Display warning of OS contract slug is missing
          if (!contract.slug) {
            console.warn('Missing contract slug for Opensea storefront collection')
            return
          } else {
            // Keep track of user specified slugs
            openseaSlugs.push(contract.slug)
          }
        }
        contractAddresses.push(contract.address)
      })

      // Get collections
      const { collection } = await fetch(
        `https://api.ethpass.xyz/api/public/assets?chainId=137&address=${address}&contractAddresses=${contractAddresses}`,
        {
          method: 'GET',
          headers: new Headers({
            'content-type': 'application/json',
            'x-api-key': publicKey,
          }),
        }
      ).then((nfts) => nfts.json())

      // Check for valid OS NFTs
      const nfts: any[] = []
      Object.keys(collection).forEach((key) => {
        collection[key].forEach((nft) => {
          if (
            nft.contract.address.toLowerCase() === OS_STOREFRONT_ADDRESS.toLowerCase() &&
            !openseaSlugs.includes(nft.collection.slug)
          ) {
            return
          }
          nfts.push(nft)
        })
      })
      setOwnedNfts(nfts)
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage(`Unexpected error: ${error}`)
      }
      setDisableClose(false)
      setModal('Error')
    } finally {
      setIsLoading(false)
    }
  }

  const checkExistingPass = async (
    ownerAddress: string | undefined,
    contractAddress?: string | undefined,
    tokenId?: string
  ) => {
    setNft({
      contractAddress,
      tokenId,
    })

    if (
      (!checkDuplicateWallet && !checkDuplicateToken) ||
      (checkDuplicateWallet && contractAddress)
    ) {
      setModal('Select Platform')
      return
    }

    const { signature, signatureMessage } = await requestSignature()
    if (!signatureMessage || !signature) {
      setModal('Select NFT')
      return
    }
    const searchParams = new URLSearchParams()

    searchParams.append('expired', '0')
    searchParams.append('signature', signature as string)
    searchParams.append('signatureMessage', signatureMessage as string)

    setModal('Verifying')
    let url
    if (checkDuplicateWallet) {
      // Check if the wallet is already registered
      url = `'https://api.ethpass.xyz/api/public/sdk/passes/get?${searchParams.toString()}`
    } else {
      // Check if the NFT is already registered
      searchParams.append('contractAddress', contractAddress as string)
      searchParams.append('tokenId', tokenId as string)
      searchParams.append('chain', 'evm')
      searchParams.append('network', String(chain?.network))

      url = `https://api.ethpass.xyz/api/public/sdk/passes/get?${searchParams.toString()}`
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: new Headers({
          'content-type': 'application/json',
          'x-api-key': publicKey,
        }),
      })
      if (response.status === 200) {
        const activePasses = await response.json()

        if (activePasses?.length) {
          // @TODO Support case with multiple passes
          const pass = activePasses[0]
          const response = await fetch(
            `'https://api.ethpass.xyz/api/public/sdk/passes/distribute?id=${pass.id}`,
            {
              method: 'GET',
              headers: new Headers({
                'content-type': 'application/json',
                'x-api-key': publicKey,
              }),
            }
          )
          const fileJson = await response.json()
          if (fileJson?.fileURL) {
            setFileUrl(fileJson.fileURL)
            QRCode.toDataURL(fileJson.fileURL, {}, (error, url) => {
              if (error) throw error
              setQRCode(url)
            })
            setModal('Pass Generated')
            setPlatform(pass.platform)
          }
        } else {
          // setModal('Select Platform');
          contractAddress ? setModal('Select Platform') : getOwnedNfts()
        }
      } else {
        setErrorMessage(`${response.status}: ${response.statusText}`)
        setDisableClose(false)
        setModal('Error')
      }
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage(`Unexpected error: ${error}`)
      }
      setDisableClose(false)
      setModal('Error')
    }
  }

  const requestSignature = async () => {
    setIsActive(true)
    setModal('Signature Request')
    try {
      let signatureMessage = `Sign this message to generate a pass with ethpass. \n${Date.now()}`
      //@ts-ignore
      let signature = await signer?.signMessage(signatureMessage)

      setSig({
        signature: signature as string,
        signatureMessage,
      })

      return { signature, signatureMessage }
    } catch (error) {
      setSig({
        signature: '',
        signatureMessage: '',
      })

      return { signature: null, signatureMessage: null }
    }
  }

  const generatePass = async (platform: string) => {
    setPlatform(platform)

    let signature, signatureMessage
    if (!sig.signature) {
      const sig = await requestSignature()
      signature = sig.signature
      signatureMessage = sig.signatureMessage
    }

    setDisableClose(true)
    setModal('Generating Pass')

    console.log('@@@ chain', nft)
    console.log('@@@ chain', chain)

    // Request body
    const payload = {
      profile,
      platform,
      chainId: chain?.network,
      contractAddress: nft.contractAddress,
      signature: sig.signature || signature,
      signatureMessage: sig.signatureMessage || signatureMessage,
      tokenId: nft.tokenId,
      barcode: {
        message: 'Verified lens profile.',
      },
    }

    // Send request
    try {
      const response = await fetch(`/api/ethpass/create`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: new Headers({
          'content-type': 'application/json',
          'x-api-key': publicKey,
        }),
      })

      if (response.status === 200) {
        const json = await response.json()
        setFileUrl(json.fileURL)

        QRCode.toDataURL(json.fileURL, {}, (error, url) => {
          if (error) throw error
          setQRCode(url)
        })
        setDisableClose(false)
        setModal('Pass Generated')
      } else if (response.status === 401) {
        setErrorMessage(`Unable to verify ownership: ${response.statusText}`)
        setDisableClose(false)
        setModal('Error')
      } else {
        try {
          const { error, message } = await response.json()
          setErrorMessage(error || message)
        } catch {
          setErrorMessage(`${response.status}: ${response.statusText}`)
        }
        setDisableClose(false)
        setModal('Error')
      }
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage(`Unexpected error: ${error}`)
      }
      setDisableClose(false)
      setModal('Error')
    }
  }

  return (
    <>
      <button
        className={
          className
            ? className
            : 'select-none rounded-lg bg-indigo-600 px-3 py-1.5 text-white transition duration-100 ease-in-out hover:bg-indigo-700'
        }
        onClick={checkIsConnected}
      >
        Generate Pass
      </button>

      <Modal
        title={modal}
        isActive={isActive}
        onClose={() => setIsActive(false)}
        disableClose={disableClose}
      >
        {modal === 'Select NFT' && (
          <div className="flex w-full overflow-y-auto overflow-x-hidden">
            {isLoading ? (
              <div className="flex h-32 w-full flex-col items-center justify-center">
                <Ring size={60} color="#4F46E5" />
              </div>
            ) : ownedNfts.length === 0 ? (
              <span className="flex w-full items-center justify-center text-sm opacity-50">
                Oops! Looks like you have no eligible NFTs.
              </span>
            ) : (
              <div
                className={`flex max-h-[320px] w-full flex-shrink-0 flex-wrap items-start justify-evenly ${
                  ownedNfts.length === 1 ? 'w-full justify-center' : 'justify-start'
                } gap-4`}
              >
                {ownedNfts.map(
                  (nft: {
                    contract: { address: string }
                    tokenId: string
                    media: {
                      videoUrl: string
                      imageUrl: string
                      thumbnailUrl: string
                    }
                  }) => {
                    return (
                      <button
                        className="rounded-xl"
                        onClick={() => {
                          checkExistingPass(address, nft.contract.address, nft.tokenId)
                        }}
                        key={nft.tokenId}
                      >
                        {nft.media.imageUrl ? (
                          <div className="relative select-none">
                            <img
                              className="h-[9.5rem] w-[9.5rem] rounded-xl object-cover"
                              src={nft.media.imageUrl}
                            />
                            <div className="absolute top-0 left-0 flex items-end p-2">
                              <div className="rounded bg-black/60 py-1 px-2 text-xs font-medium text-white">
                                #
                                {nft.tokenId.length <= 12
                                  ? nft.tokenId
                                  : `${nft.tokenId.slice(0, 4)}...${nft.tokenId.slice(-4)}`}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="relative select-none">
                            <video
                              className="h-[9.5rem] w-[9.5rem] rounded-xl bg-black"
                              autoPlay
                              loop
                              muted
                            >
                              <source src={nft.media.videoUrl} type="video/mp4" />
                            </video>
                            <div className="absolute top-0 left-0 flex items-end p-2">
                              <div className="rounded bg-black/60 py-1 px-2 text-xs font-medium text-white">
                                #
                                {nft.tokenId.length <= 12
                                  ? nft.tokenId
                                  : `${nft.tokenId.slice(0, 4)}...${nft.tokenId.slice(-4)}`}
                              </div>
                            </div>
                          </div>
                        )}
                      </button>
                    )
                  }
                )}
              </div>
            )}
          </div>
        )}

        {modal === 'Verifying' && (
          <div className="flex w-full flex-col items-center justify-center gap-4">
            <Ring size={60} color="#4F46E5" />
          </div>
        )}

        {modal === 'Select Platform' && (
          <div className="flex w-full flex-col gap-4">
            <button
              className="flex cursor-pointer select-none items-center justify-center gap-4 rounded-xl border bg-white p-3 text-gray-700 transition duration-100 ease-in-out hover:bg-gray-50"
              onClick={() => generatePass('apple')}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
                <img className="h-5" src="https://nwpass.vercel.app/img/apple-wallet.png" />
              </div>
              <div className="w-[105px] text-left">Apple Wallet</div>
            </button>
            <button
              className="flex cursor-pointer select-none items-center justify-center gap-4 rounded-xl border bg-white p-3 text-gray-700 transition duration-100 ease-in-out hover:bg-gray-50"
              onClick={() => generatePass('google')}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
                <img className="h-6" src="https://nwpass.vercel.app/img/google-wallet.png" />
              </div>
              <div className="w-[105px] text-left">Google Wallet</div>
            </button>
          </div>
        )}

        {modal === 'Signature Request' && (
          <div className="flex w-full flex-col items-center justify-center gap-4">
            <Ring size={60} color="#4F46E5" />

            <div className="flex flex-col gap-2 text-center">
              <p className="font-medium">Waiting for signature...</p>
              <p className="text-xs opacity-50">
                Signing is a safe, cost-less transaction that does not in any way give us permission
                to access your tokens or perform transactions with your wallet.
              </p>
            </div>
          </div>
        )}

        {modal === 'Generating Pass' && (
          <div className="flex w-full flex-col items-center justify-center">
            <img
              className="h-40 w-40 rounded-xl"
              src="https://github.com/Firemoon777/qrtetris/raw/master/res/qr.gif"
            />
            <RaceBy size={125} lineWeight={1} />
          </div>
        )}

        {modal === 'Pass Generated' && (
          <div className="flex w-full flex-col text-center">
            <div className="flex flex-col gap-4">
              {!isMobile && (
                <>
                  <p className="text-sm opacity-50">{`Scan QR code using your ${
                    platform.toLowerCase() === 'apple' ? 'Apple' : 'Android'
                  } device.`}</p>
                  <div className="w-250 h-250 flex justify-center">
                    <img className="max-h-[250px] max-w-[250px] rounded-lg" src={qrCode} />
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-yellow-300/60 bg-yellow-300/20 p-2 text-left font-medium text-yellow-600">
                    <p className="text-xs">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="mr-1 inline h-4 w-4 text-yellow-400"
                      >
                        <path
                          fillRule="evenodd"
                          d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                          clipRule="evenodd"
                        />
                      </svg>
                      This is not your mobile pass. You need to scan the QR code to add it to your{' '}
                      {platform.toLowerCase() === 'apple' ? 'Apple' : 'Android'} wallet.
                    </p>
                  </div>
                </>
              )}

              <p className="text-sm opacity-50">
                {isMobile ? 'Tap' : 'Or tap'} below to download directly on your device.
              </p>
              <a
                className="flex items-center justify-center"
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  className="h-12"
                  src={`https://nwpass.vercel.app/img/${
                    platform && platform.toLowerCase() === 'apple' ? 'apple' : 'google'
                  }-wallet-add.svg`}
                />
              </a>
            </div>
          </div>
        )}

        {modal === 'Error' && (
          <div className="flex w-full flex-col items-center justify-center">
            <p className="text-sm opacity-50">{errorMessage}</p>
          </div>
        )}
      </Modal>
    </>
  )
}

export default GeneratePass
