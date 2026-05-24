import { ThemeProvider } from '@/app/theme';
import { VaultProvider, useVault } from '@/modules/vault/VaultProvider';
import { AppShell } from '@/app/AppShell';
import { VaultSetup } from '@/modules/vault/VaultSetup';

function AppContent() {
  const { vault, loading } = useVault();

  if (loading) {
    return <div className="flex h-screen w-screen items-center justify-center bg-[#fcfcf9] text-[#7e7e78]">加载中...</div>;
  }

  if (!vault) {
    return (
      <div className="flex h-screen w-screen bg-[#fcfcf9]">
        <VaultSetup />
      </div>
    );
  }

  return <AppShell />;
}

function App() {
  return (
    <ThemeProvider>
      <VaultProvider>
        <AppContent />
      </VaultProvider>
    </ThemeProvider>
  );
}

export default App;
