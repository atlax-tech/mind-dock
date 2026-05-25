import { ThemeProvider } from '@/app/theme';
import { VaultProvider, useVault } from '@/modules/vault/VaultProvider';
import { CaptureProvider } from '@/modules/capture/CaptureProvider';
import { NotificationProvider } from '@/modules/notifications/NotificationProvider';
import { StickyNotesProvider } from '@/modules/sticky-notes/StickyNotesProvider';
import { AIRuntimeProvider } from '@/modules/ai/AIRuntimeProvider';
import { AISuggestionsProvider } from '@/modules/ai/AISuggestionsProvider';
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

  return (
    <AIRuntimeProvider>
      <AISuggestionsProvider>
        <CaptureProvider>
          <NotificationProvider vaultPath={vault.path}>
            <StickyNotesProvider>
              <AppShell />
            </StickyNotesProvider>
          </NotificationProvider>
        </CaptureProvider>
      </AISuggestionsProvider>
    </AIRuntimeProvider>
  );
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
