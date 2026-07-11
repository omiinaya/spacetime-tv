import { useState } from "react";
import {
  verifyProfilePin,
  createProfile as createProfileApi,
  deleteProfileApi,
  Profile,
} from "@/hooks/useProfile";
import { User, Lock, Plus, Trash2, X } from "lucide-react";

interface ProfilePickerProps {
  profiles: Profile[];
  loading: boolean;
  onSelect: (profile: Profile) => void;
  onRefresh: () => Promise<any>;
}

export default function ProfilePicker({
  profiles,
  loading,
  onSelect,
  onRefresh,
}: ProfilePickerProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [pinEntry, setPinEntry] = useState<Profile | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newConfirm, setNewConfirm] = useState("");
  const [createError, setCreateError] = useState("");

  const handleProfileClick = async (p: Profile) => {
    try {
      const valid = await verifyProfilePin(p.profile_id, "");
      if (valid) {
        onSelect(p);
        return;
      }
    } catch {
      // fall through to PIN entry
    }
    setPinEntry(p);
    setPin("");
    setPinError(false);
  };

  const handlePinSubmit = async () => {
    if (!pinEntry) return;
    try {
      const valid = await verifyProfilePin(pinEntry.profile_id, pin);
      if (valid) {
        onSelect(pinEntry);
        setPinEntry(null);
        setPin("");
      } else {
        setPinError(true);
      }
    } catch {
      setPinError(true);
    }
  };

  const handleCreate = async () => {
    setCreateError("");
    const name = newName.trim();
    if (!name || name.length < 1 || name.length > 50) {
      setCreateError("Name must be 1-50 characters");
      return;
    }
    if (!newPin || newPin.length < 4 || !/^\d+$/.test(newPin)) {
      setCreateError("PIN must be 4-6 digits");
      return;
    }
    if (newPin !== newConfirm) {
      setCreateError("PINs do not match");
      return;
    }
    try {
      await createProfileApi(name, newPin);
      setShowCreate(false);
      setNewName("");
      setNewPin("");
      setNewConfirm("");
      await onRefresh();
    } catch (e: any) {
      setCreateError(e.message || "Failed to create profile");
    }
  };

  const handleDelete = async (profileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this profile? This cannot be undone.")) return;
    try {
      await deleteProfileApi(profileId);
      await onRefresh();
    } catch {
      // ignore
    }
  };

  if (pinEntry) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-[#1a1a2e] rounded-2xl p-8 w-full max-w-sm mx-4 border border-[#2a2a4e] shadow-2xl">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-[#252540] flex items-center justify-center">
              <Lock className="h-8 w-8 text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">Enter PIN for {pinEntry.name}</h2>
            <p className="text-sm text-gray-400">Enter your profile PIN to continue</p>
            <input type="password" inputMode="numeric" maxLength={6} autoFocus value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handlePinSubmit(); if (e.key === "Escape") setPinEntry(null); }}
              className="w-full h-12 px-4 rounded-xl bg-[#252540] border border-[#3a3a5e] text-white text-center text-2xl tracking-[0.5em] placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="●●●●" />
            {pinError && <p className="text-sm text-red-400">Incorrect PIN. Try again.</p>}
            <div className="flex gap-3 w-full">
              <button onClick={() => setPinEntry(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-[#3a3a5e] text-sm text-gray-300 hover:bg-[#252540] transition-colors">Cancel</button>
              <button onClick={handlePinSubmit} disabled={pin.length < 4} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-sm text-white font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors">Unlock</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showCreate) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-[#1a1a2e] rounded-2xl p-8 w-full max-w-sm mx-4 border border-[#2a2a4e] shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-white">Create Profile</h2>
            <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-[#252540] transition-colors"><X className="h-5 w-5 text-gray-400" /></button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Profile Name</label>
              <input type="text" maxLength={50} value={newName} onChange={(e) => setNewName(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#252540] border border-[#3a3a5e] text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" placeholder="Enter a name" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">PIN (4-6 digits)</label>
              <input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                className="w-full h-10 px-3 rounded-xl bg-[#252540] border border-[#3a3a5e] text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" placeholder="●●●●" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Confirm PIN</label>
              <input type="password" inputMode="numeric" maxLength={6} value={newConfirm} onChange={(e) => setNewConfirm(e.target.value.replace(/\D/g, ""))}
                className="w-full h-10 px-3 rounded-xl bg-[#252540] border border-[#3a3a5e] text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" placeholder="●●●●" />
            </div>
            {createError && <p className="text-sm text-red-400">{createError}</p>}
            <button onClick={handleCreate} disabled={!newName.trim() || newPin.length < 4 || newPin !== newConfirm}
              className="w-full py-2.5 rounded-xl bg-blue-600 text-sm text-white font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors">Create Profile</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Who's Watching?</h1>
          <p className="text-gray-400 text-sm">Select a profile to continue</p>
        </div>
        {loading ? (
          <div className="flex justify-center">
            <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-6">No profiles yet. Create your first profile to get started.</p>
            <button onClick={() => setShowCreate(true)} className="px-6 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">Create Profile</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
            {profiles.map((p) => (
              <button key={p.profile_id} onClick={() => handleProfileClick(p)}
                className="group flex flex-col items-center gap-3 p-6 rounded-2xl bg-[#1a1a2e] border border-[#2a2a4e] hover:border-blue-500/50 hover:bg-[#1e1e38] transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 relative">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg group-hover:scale-110 transition-transform">
                  {p.avatar === "default" ? <User className="h-8 w-8" /> : p.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-white">{p.name}</span>
                <button onClick={(e) => handleDelete(p.profile_id, e)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all" title="Delete profile">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </button>
            ))}
            <button onClick={() => setShowCreate(true)}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-dashed border-[#3a3a5e] hover:border-blue-500/50 hover:bg-[#1a1a2e] transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50">
              <div className="h-16 w-16 rounded-full bg-[#252540] flex items-center justify-center">
                <Plus className="h-8 w-8 text-gray-400 group-hover:text-blue-400 transition-colors" />
              </div>
              <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors">Add Profile</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
