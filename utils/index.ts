import { ApolloClient, ApolloLink, HttpLink, InMemoryCache, gql } from '@apollo/client'

// @TODO: Fix file structure
const API_URL = 'https://api.lens.dev/'
const httpLink = new HttpLink({ uri: API_URL })

const authLink = new ApolloLink((operation, forward) => {
  const token = sessionStorage.getItem('accessToken')

  operation.setContext({
    headers: {
      'x-access-token': token ? `Bearer ${token}` : '',
    },
  })

  return forward(operation)
})

export const apolloClient = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
})

const GET_CHALLENGE = `
    query($request: ChallengeRequest!) {
        challenge(request: $request) { text }
    }
`

export const generateChallenge = async (address: string) => {
  const res = await apolloClient.query({
    query: gql(GET_CHALLENGE),
    variables: {
      request: {
        address,
      },
    },
  })
  return res.data.challenge.text
}

const AUTHENTICATION = `
  mutation($request: SignedAuthChallenge!) {
    authenticate(request: $request) {
      accessToken
      refreshToken
    }
 }
`

export const authenticate = async (address: string, signature: string) => {
  const { data } = await apolloClient.mutate({
    mutation: gql(AUTHENTICATION),
    variables: {
      request: {
        address,
        signature,
      },
    },
  })
  return data.authenticate.accessToken
}

const GET_PROFILE = `
    query DefaultProfile($address: EthereumAddress!) {
      defaultProfile(request: { ethereumAddress: $address }) {
        id
        name
        bio
        isDefault
        attributes {
          displayType
          traitType
          key
          value
        }
        followNftAddress
        metadata
        handle
        picture {
          ... on NftImage {
            contractAddress
            tokenId
            uri
            chainId
            verified
          }
          ... on MediaSet {
            original {
              url
              mimeType
            }
          }
        }
        coverPicture {
          ... on NftImage {
            contractAddress
            tokenId
            uri
            chainId
            verified
          }
          ... on MediaSet {
            original {
              url
              mimeType
            }
          }
        }
        ownedBy
        dispatcher {
          address
          canUseRelay
        }
        stats {
          totalFollowers
          totalFollowing
          totalPosts
          totalComments
          totalMirrors
          totalPublications
          totalCollects
        }
        followModule {
          ... on FeeFollowModuleSettings {
            type
            contractAddress
            amount {
              asset {
                name
                symbol
                decimals
                address
              }
              value
            }
            recipient
          }
          ... on ProfileFollowModuleSettings {
          type
          }
          ... on RevertFollowModuleSettings {
          type
          }
        }
      }
    }
`

export const getDefaultProfile = async (address: string) => {
  const res = await apolloClient.query({
    query: gql(GET_PROFILE),
    variables: {
      address,
    },
  })
  return res.data.defaultProfile
}
