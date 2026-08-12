import React, { useEffect, useState } from 'react';
import { Award, Trash2 } from 'lucide-react';

export interface LeaderboardEntry {
  id: string;
  p1Name: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  winner: string;
  date: string;
  maxSmile1: number;
  maxSmile2: number;
  avgFps: number;
}

export const Leaderboard: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('emotion_pong_leaderboard');
    if (stored) {
      try {
        setEntries(JSON.parse(stored));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const clearLeaderboard = () => {
    if (window.confirm("ARE YOU SURE YOU WANT TO CLEAR ALL HIGH SCORES?")) {
      localStorage.removeItem('emotion_pong_leaderboard');
      setEntries([]);
    }
  };

  return (
    <div className="bg-black border-2 border-yellow-500 font-mono text-[10px] text-yellow-500 p-3 select-none box-border uppercase leading-tight relative shadow-[0_0_15px_rgba(234,179,8,0.2)]">
      <div className="flex justify-between items-center border-b border-yellow-500 pb-1 mb-2">
        <span className="text-xs font-bold flex items-center gap-1">
          <Award className="w-3 h-3 text-yellow-400 animate-bounce" />
          LOCAL_HIGH_SCORES.DAT
        </span>
        <button 
          onClick={clearLeaderboard}
          title="Clear Board"
          className="text-red-500 hover:text-red-400 cursor-pointer active:scale-95 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[9px] border-collapse text-left">
          <thead>
            <tr className="border-b border-yellow-500/50 text-yellow-400 font-bold">
              <th className="py-1 pr-1">RANK</th>
              <th className="py-1">PLAYERS</th>
              <th className="py-1 text-center">SCORE</th>
              <th className="py-1 text-right">WINNER</th>
              <th className="py-1 text-right hidden sm:table-cell">EXPR_MAX</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-yellow-700 animate-pulse">
                  NO HIGH SCORES RECORDED YET
                </td>
              </tr>
            ) : (
              entries.map((entry, index) => (
                <tr key={entry.id} className="border-b border-yellow-500/10 hover:bg-yellow-500/5 transition-colors">
                  <td className="py-1.5 font-bold text-yellow-300">
                    {index === 0 ? '🏆 1ST' : index === 1 ? '🥈 2ND' : index === 2 ? '🥉 3RD' : `${index + 1}TH`}
                  </td>
                  <td className="py-1.5 truncate max-w-[100px]">
                    <span className="text-yellow-100">{entry.p1Name}</span> vs <span className="text-yellow-100">{entry.p2Name}</span>
                  </td>
                  <td className="py-1.5 text-center font-bold text-yellow-200">
                    {entry.p1Score} - {entry.p2Score}
                  </td>
                  <td className="py-1.5 text-right font-bold text-yellow-300">
                    {entry.winner}
                  </td>
                  <td className="py-1.5 text-right text-yellow-400 hidden sm:table-cell">
                    P1:{(entry.maxSmile1 * 100).toFixed(0)}% / P2:{(entry.maxSmile2 * 100).toFixed(0)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[8px] text-yellow-600/70 border-t border-yellow-500/20 pt-1 flex justify-between">
        <span>STORED_IN_BROWSER</span>
        <span>1v1 EMOTION ARCADE</span>
      </div>
    </div>
  );
};

export const addLeaderboardEntry = (newEntry: Omit<LeaderboardEntry, 'id' | 'date'>) => {
  const stored = localStorage.getItem('emotion_pong_leaderboard');
  let currentList: LeaderboardEntry[] = [];
  if (stored) {
    try {
      currentList = JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
  }

  const entryWithMeta: LeaderboardEntry = {
    ...newEntry,
    id: Math.random().toString(36).substr(2, 9),
    date: new Date().toLocaleString()
  };

  currentList.push(entryWithMeta);
  // Sort entries: games with higher score totals, or just order of creation, or sort by highest smile intensity.
  // Let's sort by date descending (most recent first)
  currentList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  // Cap at top 10 scores
  const cappedList = currentList.slice(0, 10);
  localStorage.setItem('emotion_pong_leaderboard', JSON.stringify(cappedList));
};
