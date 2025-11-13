'use client';

import { 
  ApolloClient, 
  InMemoryCache, 
  ApolloProvider, 
  createHttpLink,
  split,
  HttpLink
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { getMainDefinition } from '@apollo/client/utilities';
import { WebSocketLink } from '@apollo/client/link/ws';

// URL HTTP ke Gateway
const httpUri = process.env.NEXT_PUBLIC_API_GATEWAY_URL ? `${process.env.NEXT_PUBLIC_API_GATEWAY_URL}/graphql` : 'http://localhost:3000/graphql';

// URL WebSocket ke Gateway
const wsUri = process.env.NEXT_PUBLIC_API_GATEWAY_WS_URL || 'ws://localhost:3000/graphql';


const httpLink = createHttpLink({
  uri: httpUri,
});

// Link untuk autentikasi (menambahkan header)
const authLink = setContext((_, { headers }) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt-token') : null;
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    }
  }
});

// Link untuk WebSocket (Subscriptions)
const wsLink = typeof window !== 'undefined' ? new WebSocketLink({
  uri: wsUri,
  options: {
    reconnect: true,
    connectionParams: {
      // Kirim token saat koneksi WS
      Authorization: `Bearer ${localStorage.getItem('jwt-token')}`,
    },
  },
}) : null;


// 'split' akan mengarahkan request
const link = typeof window !== 'undefined' && wsLink ? split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  authLink.concat(httpLink),
) : authLink.concat(httpLink);

const client = new ApolloClient({
  link: link,
  cache: new InMemoryCache(),
});

export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}