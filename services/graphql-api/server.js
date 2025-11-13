const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const { PubSub, withFilter } = require('graphql-subscriptions'); // Import withFilter
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const { createServer } = require('http'); // Untuk subscriptions
const { execute, subscribe } = require('graphql');
const { SubscriptionServer } = require('subscriptions-transport-ws');
const { makeExecutableSchema } = require('@graphql-tools/schema');

const app = express();
const pubsub = new PubSub();

// Enable CORS
app.use(cors({
  origin: [
    'http://localhost:3000', // API Gateway
    'http://localhost:3002', // Frontend
    'http://api-gateway:3000', 
    'http://frontend-app:3002' 
  ],
  credentials: true
}));

// Database In-memory (Tasks)
let tasks = [
  {
    id: '1',
    title: 'Design database schema',
    description: 'Design schema for user, team, and task tables',
    status: 'IN_PROGRESS',
    assigneeId: '1', 
    teamId: 'team-1', // ID Tim
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'Implement JWT Authentication',
    description: 'Implement RS256 JWT auth in user-service',
    status: 'TODO',
    assigneeId: '2',
    teamId: 'team-1',
    createdAt: new Date().toISOString(),
  }
];

// GraphQL type definitions (Skema)
const typeDefs = `
  enum TaskStatus {
    TODO
    IN_PROGRESS
    DONE
    ARCHIVED
  }

  type Task {
    id: ID!
    title: String!
    description: String
    status: TaskStatus!
    assigneeId: ID
    teamId: ID!
    createdAt: String!
  }

  type Query {
    tasks(teamId: ID!): [Task!]!
    task(id: ID!): Task
  }

  type Mutation {
    createTask(title: String!, description: String, teamId: ID!, assigneeId: ID): Task!
    updateTaskStatus(id: ID!, status: TaskStatus!): Task!
    assignTask(id: ID!, assigneeId: ID!): Task!
  }

  type Subscription {
    taskUpdated(teamId: ID!): Task!
    taskAdded(teamId: ID!): Task!
  }
`;

// GraphQL resolvers (Logika)
const resolvers = {
  Query: {
    tasks: (_, { teamId }) => tasks.filter(task => task.teamId === teamId),
    task: (_, { id }) => tasks.find(task => task.id === id),
  },

  Mutation: {
    createTask: (_, { title, description, teamId, assigneeId }) => {
      const newTask = {
        id: uuidv4(),
        title,
        description: description || '',
        status: 'TODO',
        assigneeId: assigneeId || null,
        teamId,
        createdAt: new Date().toISOString(),
      };
      tasks.push(newTask);
      pubsub.publish('TASK_ADDED', { taskAdded: newTask });
      return newTask;
    },

    updateTaskStatus: (_, { id, status }) => {
      const taskIndex = tasks.findIndex(task => task.id === id);
      if (taskIndex === -1) {
        throw new Error('Task not found');
      }
      const updatedTask = { ...tasks[taskIndex], status };
      tasks[taskIndex] = updatedTask;
      pubsub.publish('TASK_UPDATED', { taskUpdated: updatedTask });
      return updatedTask;
    },
    
    assignTask: (_, { id, assigneeId }) => {
      const taskIndex = tasks.findIndex(task => task.id === id);
      if (taskIndex === -1) {
        throw new Error('Task not found');
      }
      const updatedTask = { ...tasks[taskIndex], assigneeId };
      tasks[taskIndex] = updatedTask;
      pubsub.publish('TASK_UPDATED', { taskUpdated: updatedTask });
      return updatedTask;
    }
  },

  Subscription: {
    taskUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['TASK_UPDATED']),
        (payload, variables) => {
          return payload.taskUpdated.teamId === variables.teamId;
        }
      ),
    },
    taskAdded: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['TASK_ADDED']),
        (payload, variables) => {
          return payload.taskAdded.teamId === variables.teamId;
        }
      ),
    }
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

async function startServer() {
  const server = new ApolloServer({
    schema,
    context: ({ req }) => {
      // Akses header yang di-inject oleh gateway
      const userId = req.headers['x-user-id'];
      const userEmail = req.headers['x-user-email'];
      console.log(`[Task Service] Request received from user: ${userEmail} (${userId})`);
      return { userId, userEmail };
    },
  });

  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  const PORT = process.env.PORT || 4000;
  const httpServer = createServer(app);

  httpServer.listen(PORT, () => {
    console.log(`🚀 Task Service (GraphQL) running on port ${PORT}`);
    console.log(`🎯 GraphQL endpoint: http://localhost:${PORT}${server.graphqlPath}`);
    
    new SubscriptionServer({
      execute,
      subscribe,
      schema,
    }, {
      server: httpServer,
      path: '/graphql',
    });
    console.log(`🔌 Subscriptions ready at ws://localhost:${PORT}/graphql`);
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy',
      service: 'Task Service (GraphQL)', // Ubah nama
      timestamp: new Date().toISOString(),
      data: {
        tasks: tasks.length
      }
    });
  });
}

startServer().catch(error => {
  console.error('Failed to start Task Service:', error);
  process.exit(1);
});