import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { vaultService } from '@/services/filesystem/vault';
import { metadataService } from '@/services/index/metadata';
import type { VaultInfo, DocEntry } from '@/types/vault';

interface VaultState {
  vault: VaultInfo | null;
  docTree: DocEntry[];
  loading: boolean;
  error: string | null;
  createVault: (path: string) => Promise<void>;
  selectVault: (path: string) => Promise<void>;
  pickAndCreateVault: () => Promise<void>;
  pickAndSelectVault: () => Promise<void>;
  refreshDocTree: () => Promise<void>;
  switchVault: () => void;
}

const VaultContext = createContext<VaultState | null>(null);

export function useVault(): VaultState {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used within VaultProvider');
  return ctx;
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [docTree, setDocTree] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 启动时加载上次 vault，先校验路径有效性
  useEffect(() => {
    (async () => {
      try {
        const lastPath = await vaultService.getLastVaultPath();
        if (lastPath) {
          // 先校验 vault 路径是否有效，避免前后端路径不一致导致保存失败
          const validation = await vaultService.validateVault(lastPath);
          if (validation.valid) {
            const info = await vaultService.selectVault(lastPath);
            setVault(info);
            await metadataService.initMetadataDb(lastPath);
            const tree = await vaultService.scanVaultFiles(lastPath);
            setDocTree(tree);
          } else {
            // vault 无效（路径不存在/缺少子目录/无写入权限），清除状态引导重新选择
            setError(validation.error || 'Vault 路径无效');
          }
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const refreshDocTree = useCallback(async () => {
    if (!vault) return;
    try {
      const tree = await vaultService.scanVaultFiles(vault.path);
      setDocTree(tree);
    } catch (err) {
      setError(String(err));
    }
  }, [vault]);

  const createVault = useCallback(async (path: string) => {
    try {
      setError(null);
      const info = await vaultService.createVault(path);
      setVault(info);
      await metadataService.initMetadataDb(info.path);
      const tree = await vaultService.scanVaultFiles(info.path);
      setDocTree(tree);
    } catch (err) {
      setError(String(err));
      throw err;
    }
  }, []);

  const selectVault = useCallback(async (path: string) => {
    try {
      setError(null);
      const info = await vaultService.selectVault(path);
      setVault(info);
      await metadataService.initMetadataDb(info.path);
      const tree = await vaultService.scanVaultFiles(info.path);
      setDocTree(tree);
    } catch (err) {
      setError(String(err));
      throw err;
    }
  }, []);

  const pickAndCreateVault = useCallback(async () => {
    const path = await vaultService.pickDirectory();
    if (path) {
      await createVault(path);
    }
  }, [createVault]);

  const pickAndSelectVault = useCallback(async () => {
    const path = await vaultService.pickDirectory();
    if (path) {
      await selectVault(path);
    }
  }, [selectVault]);

  // 切换 Vault：清除当前 vault 状态，回到 VaultSetup 引导页
  const switchVault = useCallback(() => {
    setVault(null);
    setDocTree([]);
    setError(null);
  }, []);

  return (
    <VaultContext.Provider
      value={{
        vault,
        docTree,
        loading,
        error,
        createVault,
        selectVault,
        pickAndCreateVault,
        pickAndSelectVault,
        refreshDocTree,
        switchVault,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}
