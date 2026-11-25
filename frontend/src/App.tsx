import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WorkspaceProvider } from './hooks/useDiscountWorkspace';
import { DashboardLayout } from './layouts/DashboardLayout';
import { DashboardPage } from './pages/DashboardPage';
import { RulesPage } from './pages/RulesPage';
import { CartPage } from './pages/CartPage';
import { AiBuilderPage } from './pages/AiBuilderPage';
import { PdfUploadPage } from './pages/PdfUploadPage';
import { ResultsPage } from './pages/ResultsPage';

export default function App() {
  return (
    <BrowserRouter>
      <WorkspaceProvider>
        <DashboardLayout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/ai-builder" element={<AiBuilderPage />} />
            <Route path="/pdf-upload" element={<PdfUploadPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DashboardLayout>
      </WorkspaceProvider>
    </BrowserRouter>
  );
}
