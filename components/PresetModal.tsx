import React, { useState } from 'react';
import { Preset } from '../types';
import { Save, Trash2, X, FolderOpen, Disc } from 'lucide-react';

interface PresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  presets: Preset[];
  onLoad: (preset: Preset) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}

const PresetModal: React.FC<PresetModalProps> = ({ isOpen, onClose, presets, onLoad, onSave, onDelete }) => {
  const [saveName, setSaveName] = useState('');
  const [activeTab, setActiveTab] = useState<'load' | 'save'>('load');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-800/50">
          <h2 className="text-slate-200 font-bold flex items-center gap-2">
            <Disc size={18} className="text-amber-500" />
            Preset Library
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          <button 
            onClick={() => setActiveTab('load')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'load' ? 'bg-slate-800 text-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            LOAD
          </button>
          <button 
            onClick={() => setActiveTab('save')}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'save' ? 'bg-slate-800 text-amber-500' : 'text-slate-500 hover:text-slate-300'}`}
          >
            SAVE
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {activeTab === 'load' ? (
            <div className="flex flex-col gap-2">
              {presets.map((preset) => (
                <div key={preset.id} className="flex items-center justify-between group p-2 hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700">
                  <div className="flex flex-col cursor-pointer flex-1" onClick={() => { onLoad(preset); onClose(); }}>
                    <span className="text-slate-200 font-medium text-sm">{preset.name}</span>
                    <span className="text-[10px] text-slate-500 uppercase">{preset.isUser ? 'User' : 'Factory'}</span>
                  </div>
                  {preset.isUser && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDelete(preset.id); }}
                      className="p-2 text-slate-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {presets.length === 0 && <p className="text-slate-500 text-center py-4 text-sm">No presets found.</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-slate-400">PRESET NAME</label>
                <input 
                  type="text" 
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="My Acid Pattern"
                  className="bg-slate-950 border border-slate-700 rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500 text-sm"
                  autoFocus
                />
              </div>
              <button 
                onClick={() => { if(saveName) { onSave(saveName); setSaveName(''); onClose(); } }}
                disabled={!saveName.trim()}
                className="bg-amber-600 hover:bg-amber-500 text-slate-900 font-bold py-2 rounded shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                SAVE PRESET
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PresetModal;