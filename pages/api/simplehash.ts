import fetch from 'node-fetch'
import type { NextApiRequest, NextApiResponse } from 'next'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { address, contractAddresses } = req.query

    const data = await fetch(
      `https://api.simplehash.com/api/v0/nfts/owners?chains=polygon&limit=50&wallet_addresses=${address}&contract_addresses=${contractAddresses}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-api-key': process.env.SIMPLEHASH_API_KEY as string,
        },
      }
    )
    const collection = await data.json()

    res.status(200).send(collection)
  } catch (error) {
    res.status(400).send(error.message)
  }
}

export default handler
