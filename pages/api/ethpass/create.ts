import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'POST':
      const {
        profile,
        platform,
        chainId,
        contractAddress,
        image,
        signature,
        signatureMessage,
        tokenId,
        barcode,
      } = req.body

      try {
        // Customize Pass
        let pass
        if (platform === 'apple') {
          pass = {
            labelColor: 'rgb(78,70,220)',
            backgroundColor: 'rgb(255,255,255)',
            foregroundColor: 'rgb(0,0,0)',
            description: 'Lens Pass',
            headerFields: [],
            auxiliaryFields: [],
            backFields: [],
            primaryFields: [
              {
                key: 'primary1',
                label: 'HANDLE',
                value: profile.handle,
                textAlignment: 'PKTextAlignmentNatural',
              },
            ],
            secondaryFields: [
              {
                key: 'secondary1',
                label: 'NAME',
                value: profile.name,
                textAlignment: 'PKTextAlignmentLeft',
              },
              {
                key: 'secondary2',
                label: 'PROFILE ID',
                value: Number(profile.id),
                textAlignment: 'PKTextAlignmentLeft',
              },
            ],
          }
        } else {
          pass = {
            messages: [],
          }
        }

        const payload = await fetch('https://api.ethpass.xyz/api/v0/passes', {
          method: 'POST',
          body: JSON.stringify({
            chain: {
              name: 'evm',
              network: chainId,
            },
            nft: {
              contractAddress,
              tokenId,
            },
            image,
            pass,
            platform,
            signature,
            signatureMessage,
            barcode,
          }),
          headers: new Headers({
            'content-type': 'application/json',
            'x-api-key': process.env.ETHPASS_SECRET_KEY as string,
          }),
        })

        if (payload.status === 200) {
          const json = await payload.json()
          return res.status(200).json(json)
        } else {
          const json = await payload.json()
          console.log(json.message)
          return res.status(payload.status).send(json.message)
        }
      } catch (error) {
        return res.status(400).send(error.message)
      }

    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).end(`Method ${req.method} Not Allowed`)
      break
  }
}
