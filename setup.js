const fs = require('fs');
const path = require('path');

console.log('🚀 Creando estructura del proyecto...\n');

// Crear carpetas
const folders = [
  'src',
  'src/lib',
  'src/types',
  'src/hooks',
  'src/components',
  'src/components/auth',
  'src/components/layout',
  'src/components/requests',
  'src/components/boards',
  'src/components/projects',
  'src/components/dashboard',
  'src/components/common',
  'src/pages'
];

folders.forEach(folder => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    console.log(`✅ Carpeta creada: ${folder}`);
  }
});

// Crear archivos
const files = {
  'package.json': `{
  "name": "ticketera-controlling-gilat",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "@supabase/supabase-js": "^2.39.0",
    "@hello-pangea/dnd": "^16.5.0",
    "date-fns": "^2.30.0",
    "recharts": "^2.10.3"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.8"
  }
}`,

  'vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  }
})`,

  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}`,

  'tsconfig.node.json': `{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}`,

  'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        info: '#8B5CF6',
      }
    },
  },
  plugins: [],
}`,

  'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,

  '.env.local': `VITE_SUPABASE_URL=https://qjbxbdwolimraldscbpax.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_LJd3GGtQcVWWLPKJseEcyw_jf-DwD9_`,

  'index.html': `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ticketera Controlling Gilat</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,

  'README.md': `# Ticketera Controlling Gilat

## Instalación

\`\`\`bash
npm install
\`\`\`

## Desarrollo

\`\`\`bash
npm run dev
\`\`\`

Abre http://localhost:5173`,

  'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}`,

  'src/main.tsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,

  'src/App.tsx': `function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary mb-4">
          🎯 Ticketera Controlling Gilat
        </h1>
        <p className="text-gray-600">
          Proyecto configurado correctamente ✅
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Ahora vamos a agregar los componentes...
        </p>
      </div>
    </div>
  )
}

export default App`,

  'src/lib/supabase.ts': `import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)`,

  'src/types/database.types.ts': `export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'developer' | 'viewer';
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Request {
  id: string;
  request_number: string;
  requester_name: string;
  requester_email?: string;
  requester_area: string;
  request_type: string;
  origin: 'Interno' | 'Externo' | 'Regulatorio' | 'Cliente' | 'Otro';
  data_system_involved?: string;
  description: string;
  observations?: string;
  requested_date?: string;
  created_at: string;
  needs_code: boolean;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  project_id?: string;
  updated_at: string;
}

export interface Project {
  id: string;
  request_id?: string;
  title: string;
  description: string;
  project_type: 'development' | 'administrative' | 'dual';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'active' | 'completed' | 'archived';
  estimated_hours?: number;
  actual_hours?: number;
  is_blocked: boolean;
  blocked_reason?: string;
  blocked_since?: string;
  tag_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ProjectFlow {
  id: string;
  project_id: string;
  flow_type: 'administrative' | 'development';
  assigned_to?: string;
  current_phase: string;
  progress: number;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  id: string;
  project_flow_id: string;
  phase: string;
  description: string;
  completed: boolean;
  order_index: number;
  created_at: string;
  completed_at?: string;
}

export interface Comment {
  id: string;
  project_id: string;
  user_id?: string;
  content: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  project_id: string;
  user_id?: string;
  action: string;
  details: any;
  created_at: string;
}`
};

// Escribir archivos
Object.entries(files).forEach(([filename, content]) => {
  fs.writeFileSync(filename, content);
  console.log(`✅ Archivo creado: ${filename}`);
});

console.log('\n🎉 ¡Estructura creada exitosamente!');
console.log('\n📦 Ahora ejecuta: npm install');
console.log('🚀 Luego ejecuta: npm run dev\n');