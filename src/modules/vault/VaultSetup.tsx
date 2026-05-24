import { FolderPlus, FolderOpen } from 'lucide-react';
import { useVault } from './VaultProvider';

export function VaultSetup() {
  const { pickAndCreateVault, pickAndSelectVault, error } = useVault();

  return (
    <div className={`flex-1 flex items-center justify-center bg-[#fcfcf9] dark:bg-[#171717]`}>
      <div className={`max-w-md w-full p-8 bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg shadow-soft`}>
        <h2 className={`text-xl font-semibold text-[#2c2c2a] dark:text-[#e3e3e3] mb-2`}>欢迎使用 MindDock</h2>
        <p className={`text-sm text-[#7e7e78] dark:text-[#8e8e8e] mb-6`}>
          选择一个本地目录作为你的知识库（Vault），所有文档将存储在这个目录中。
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={pickAndCreateVault}
            className={`w-full flex items-center gap-3 p-4 bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg hover:border-emerald-400 hover:shadow-soft transition-all text-left`}
          >
            <FolderPlus size={20} className="text-emerald-600 shrink-0" />
            <div>
              <div className={`font-medium text-[#2c2c2a] dark:text-[#e3e3e3]`}>创建新 Vault</div>
              <div className={`text-xs text-[#7e7e78] dark:text-[#8e8e8e]`}>选择一个空目录，创建新的知识库</div>
            </div>
          </button>

          <button
            onClick={pickAndSelectVault}
            className={`w-full flex items-center gap-3 p-4 bg-white dark:bg-[#212121] border border-[#e6e6dc] dark:border-[#2f2f2f] rounded-lg hover:border-emerald-400 hover:shadow-soft transition-all text-left`}
          >
            <FolderOpen size={20} className="text-emerald-600 shrink-0" />
            <div>
              <div className={`font-medium text-[#2c2c2a] dark:text-[#e3e3e3]`}>打开已有 Vault</div>
              <div className={`text-xs text-[#7e7e78] dark:text-[#8e8e8e]`}>选择一个已有目录作为知识库</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
