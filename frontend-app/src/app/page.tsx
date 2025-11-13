'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useSubscription, gql } from '@apollo/client';
import { authApi } from '@/lib/api'; // Import authApi baru

// --- GraphQL Queries ---

const GET_TASKS = gql`
  query GetTasks($teamId: ID!) {
    tasks(teamId: $teamId) {
      id
      title
      description
      status
      assigneeId
      createdAt
    }
  }
`;

const CREATE_TASK = gql`
  mutation CreateTask($title: String!, $description: String, $teamId: ID!) {
    createTask(title: $title, description: $description, teamId: $teamId) {
      id
      title
      status
      teamId
    }
  }
`;

const UPDATE_TASK_STATUS = gql`
  mutation UpdateTaskStatus($id: ID!, $status: TaskStatus!) {
    updateTaskStatus(id: $id, status: $status) {
      id
      status
    }
  }
`;

const TASK_UPDATED_SUB = gql`
  subscription OnTaskUpdated($teamId: ID!) {
    taskUpdated(teamId: $teamId) {
      id
      title
      status
    }
  }
`;

// --- Component ---

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // State untuk Login/Register
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  // Cek token saat komponen dimuat
  useEffect(() => {
    const storedToken = localStorage.getItem('jwt-token');
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      let response;
      if (isLoginView) {
        response = await authApi.login({ email, password });
      } else {
        response = await authApi.register({ name, email, password });
        if (response.status === 201) {
          response = await authApi.login({ email, password });
        }
      }
      
      const newToken = response.data.token;
      localStorage.setItem('jwt-token', newToken);
      setToken(newToken);
      setEmail('');
      setPassword('');
      setName('');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'An error occurred');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('jwt-token');
    setToken(null);
    window.location.reload(); 
  };

  // Tampilkan form Login/Register
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h2 className="text-2xl font-bold text-center mb-6">{isLoginView ? 'Login' : 'Register'}</h2>
          <form onSubmit={handleAuthSubmit}>
            {!isLoginView && (
              <input
                type="text"
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-md px-3 py-2 mb-4"
                required
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-md px-3 py-2 mb-4"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-md px-3 py-2 mb-4"
              required
            />
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <button
              type="submit"
              className="w-full bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
            >
              {isLoginView ? 'Login' : 'Register'}
            </button>
          </form>
          <p className="text-center mt-4">
            <button onClick={() => setIsLoginView(!isLoginView)} className="text-blue-500 hover:underline">
              {isLoginView ? 'Need an account? Register' : 'Already have an account? Login'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Tampilkan Task Dashboard
  return <TaskDashboard onLogout={handleLogout} />;
}


function TaskDashboard({ onLogout }: { onLogout: () => void }) {
  const TEAM_ID = 'team-1'; // Hardcode team ID untuk demo
  const [newTaskTitle, setNewTaskTitle] = useState('');
  
  const { data, loading, error } = useQuery(GET_TASKS, { variables: { teamId: TEAM_ID } });
  
  const [createTask] = useMutation(CREATE_TASK, {
    refetchQueries: [{ query: GET_TASKS, variables: { teamId: TEAM_ID } }]
  });
  
  const [updateTaskStatus] = useMutation(UPDATE_TASK_STATUS);
  
  useSubscription(TASK_UPDATED_SUB, {
    variables: { teamId: TEAM_ID },
    onData: ({ data: subData }) => {
      console.log('Subscription data received:', subData);
      // Cache Apollo akan otomatis update
    }
  });
  
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    createTask({ variables: { title: newTaskTitle, teamId: TEAM_ID } });
    setNewTaskTitle('');
  };

  if (loading) return <p>Loading tasks...</p>;
  if (error) return <p>Error loading tasks: {error.message}</p>;

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Task Dashboard</h1>
          <button
            onClick={onLogout}
            className="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600"
          >
            Logout
          </button>
        </div>

        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Task</h2>
          <form onSubmit={handleCreateTask}>
            <input
              type="text"
              placeholder="Task title..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="w-full border rounded-md px-3 py-2"
              required
            />
            <button
              type="submit"
              className="mt-4 bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600"
            >
              Add Task
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <TaskColumn
            title="To Do"
            status="TODO"
            tasks={data.tasks.filter((t: any) => t.status === 'TODO')}
            onUpdateStatus={updateTaskStatus}
          />
          <TaskColumn
            title="In Progress"
            status="IN_PROGRESS"
            tasks={data.tasks.filter((t: any) => t.status === 'IN_PROGRESS')}
            onUpdateStatus={updateTaskStatus}
          />
          <TaskColumn
            title="Done"
            status="DONE"
            tasks={data.tasks.filter((t: any) => t.status === 'DONE')}
            onUpdateStatus={updateTaskStatus}
          />
        </div>
      </div>
    </div>
  );
}

function TaskColumn({ title, status, tasks, onUpdateStatus }: any) {
  const handleStatusChange = (taskId: string, newStatus: string) => {
    onUpdateStatus({ variables: { id: taskId, status: newStatus } });
  };
  
  return (
    <div className="bg-white shadow rounded-lg p-4">
      <h3 className="text-xl font-bold text-gray-900 mb-4">{title} ({tasks.length})</h3>
      <div className="space-y-4">
        {tasks.map((task: any) => (
          <div key={task.id} className="p-4 border rounded shadow-sm">
            <h4 className="font-semibold">{task.title}</h4>
            <p className="text-gray-600 text-sm mt-1">{task.description}</p>
            <select
              value={task.status}
              onChange={(e) => handleStatusChange(task.id, e.target.value)}
              className="mt-4 w-full border rounded-md px-2 py-1 text-sm"
            >
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DONE">Done</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}