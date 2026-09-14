"use client";

import React, { useState, useEffect, useRef } from 'react';
import { TossAds, loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';

// TODO: 토스에서 발급받은 실제 광고 ID(AdGroupId)로 변경해주세요.
const TOSS_AD_BANNER_ID = "TEST_BANNER_ID"; 
const TOSS_AD_FULLSCREEN_ID = "TEST_FULLSCREEN_ID";

const EMOJIS = ["🐶", "🐱", "🦊", "🐻", "🐼", "🐯", "🦁", "🐸", "🐰", "🐹"];
const COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7", 
  "#ec4899", "#f97316", "#14b8a6", "#6366f1", "#06b6d4",
];

type Player = {
  id: number;
  name: string;
  emoji: string;
  color: string;
};

type ViewState = "input" | "race" | "result";

const MAZE_WIDTH = 21;
const MAZE_HEIGHT = 31;

const DIRS = [
  [0, -2],
  [2, 0],
  [0, 2],
  [-2, 0],
];

export default function TossMazeRace() {
  const [view, setView] = useState<ViewState>("input");
  const [players, setPlayers] = useState<Player[]>([]);
  const [newName, setNewName] = useState("");

  const [maze, setMaze] = useState<number[][]>([]);
  const [paths, setPaths] = useState<number[][][]>([]);
  const [playerPositions, setPlayerPositions] = useState<{ x: number; y: number }[]>([]);
  const [ranks, setRanks] = useState<number[]>([]); 
  const [leaderboard, setLeaderboard] = useState<{id: number, time: number}[]>([]);
  const [penaltyCount, setPenaltyCount] = useState(1);
  const [isSlowMotion, setIsSlowMotion] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const finishedPlayersRef = useRef<{id: number, time: number}[]>([]);

  const addPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || players.length >= 10) return;
    const nextId = players.length > 0 ? Math.max(...players.map((p) => p.id)) + 1 : 1;
    const nextIdx = players.length;
    setPlayers([
      ...players,
      {
        id: nextId,
        name: newName.trim(),
        emoji: EMOJIS[nextIdx % EMOJIS.length],
        color: COLORS[nextIdx % COLORS.length],
      },
    ]);
    setNewName("");
  };

  const removePlayer = (id: number) => {
    setPlayers((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (penaltyCount > next.length - 1 && next.length >= 2) {
        setPenaltyCount(next.length - 1);
      }
      return next;
    });
  };

  const startRace = () => {
    if (players.length < 2) {
      alert("최소 2명의 참가자가 필요합니다.");
      return;
    }
    const finalPenaltyCount = Math.min(Math.max(1, penaltyCount), players.length - 1);
    setPenaltyCount(finalPenaltyCount);
    generateMazeAndPaths();
    setLeaderboard([]);
    finishedPlayersRef.current = [];
    setIsSlowMotion(false);
    setView("race");
  };

  const generateMazeAndPaths = () => {
    const grid = Array.from({ length: MAZE_HEIGHT }, () => Array(MAZE_WIDTH).fill(1));
    const stack = [[1, 1]];
    grid[1][1] = 0;

    while (stack.length > 0) {
      const idx = Math.floor(Math.random() * stack.length);
      const [cx, cy] = stack[idx];
      const neighbors = [];
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx > 0 && nx < MAZE_WIDTH - 1 && ny > 0 && ny < MAZE_HEIGHT - 1 && grid[ny][nx] === 1) {
          neighbors.push([nx, ny, cx + dx / 2, cy + dy / 2]);
        }
      }
      if (neighbors.length > 0) {
        const [nx, ny, mx, my] = neighbors[Math.floor(Math.random() * neighbors.length)];
        grid[my][mx] = 0; 
        grid[ny][nx] = 0; 
        stack.push([nx, ny]);
      } else {
        stack.splice(idx, 1);
      }
    }

    const goalX = Math.floor(MAZE_WIDTH / 2);
    const adjGoalX = goalX % 2 === 0 ? goalX - 1 : goalX;
    grid[MAZE_HEIGHT - 1][adjGoalX] = 0;
    grid[MAZE_HEIGHT - 2][adjGoalX] = 0;

    const startXs: number[] = [];
    const spacing = Math.floor((MAZE_WIDTH - 2) / players.length);
    for (let i = 0; i < players.length; i++) {
      let sx = 1 + i * spacing + Math.floor(spacing / 2);
      if (sx % 2 === 0) sx -= 1; 
      if (sx >= MAZE_WIDTH - 1) sx = MAZE_WIDTH - 2;
      startXs.push(sx);
      grid[0][sx] = 0;
      grid[1][sx] = 0;
    }

    setMaze(grid);

    const newPaths: number[][][] = [];
    for (const sx of startXs) {
      const optimalPath = findShortestPath(grid, [sx, 0], [adjGoalX, MAZE_HEIGHT - 1]);
      const wanderingPath = generateWanderingPath(grid, optimalPath);
      newPaths.push(wanderingPath);
    }
    setPaths(newPaths);

    const shuffledIds = [...players.map((p) => p.id)].sort(() => Math.random() - 0.5);
    setRanks(shuffledIds);
    setPlayerPositions(startXs.map((sx) => ({ x: sx, y: 0 })));
  };

  const findShortestPath = (grid: number[][], start: number[], goal: number[]) => {
    const queue = [[...start, 0]]; 
    const visited = new Set([`${start[0]},${start[1]}`]);
    const parent = new Map<string, string>();
    while (queue.length > 0) {
      const [cx, cy, d] = queue.shift()!;
      if (cx === goal[0] && cy === goal[1]) break;
      for (const [dx, dy] of [[0,1], [1,0], [0,-1], [-1,0]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < MAZE_WIDTH && ny >= 0 && ny < MAZE_HEIGHT && grid[ny][nx] === 0) {
          const key = `${nx},${ny}`;
          if (!visited.has(key)) {
            visited.add(key);
            parent.set(key, `${cx},${cy}`);
            queue.push([nx, ny, d + 1]);
          }
        }
      }
    }
    const path: number[][] = [];
    let curr = `${goal[0]},${goal[1]}`;
    while (curr) {
      const [x, y] = curr.split(",").map(Number);
      path.push([x, y]);
      curr = parent.get(curr)!;
    }
    return path.reverse();
  };

  const generateWanderingPath = (grid: number[][], optimalPath: number[][]) => {
    const newPath: number[][] = [];
    const optimalSet = new Set(optimalPath.map(p => `${p[0]},${p[1]}`));
    for (let i = 0; i < optimalPath.length; i++) {
      const current = optimalPath[i];
      newPath.push(current);
      if (i > 0 && i < optimalPath.length - 1 && Math.random() < 0.5) {
        const [cx, cy] = current;
        const branches = [];
        for (const [dx, dy] of [[0,1], [1,0], [0,-1], [-1,0]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx >= 0 && nx < MAZE_WIDTH && ny >= 0 && ny < MAZE_HEIGHT && grid[ny][nx] === 0) {
            if (!optimalSet.has(`${nx},${ny}`)) {
              branches.push([nx, ny]);
            }
          }
        }
        if (branches.length > 0) {
          const branch = branches[Math.floor(Math.random() * branches.length)];
          const miniPath = [branch];
          let curr = branch;
          let prev = current;
          while (true) {
            const nexts = [];
            for (const [dx, dy] of [[0,1], [1,0], [0,-1], [-1,0]]) {
              const nx = curr[0] + dx;
              const ny = curr[1] + dy;
              if (nx >= 0 && nx < MAZE_WIDTH && ny >= 0 && ny < MAZE_HEIGHT && grid[ny][nx] === 0) {
                if (nx !== prev[0] || ny !== prev[1]) {
                  nexts.push([nx, ny]);
                }
              }
            }
            if (nexts.length > 0) {
              const n = nexts[Math.floor(Math.random() * nexts.length)];
              miniPath.push(n);
              prev = curr;
              curr = n;
            } else {
              break; 
            }
          }
          for (const p of miniPath) {
            newPath.push(p);
          }
          for (let j = miniPath.length - 2; j >= 0; j--) {
            newPath.push(miniPath[j]);
          }
          newPath.push(current);
        }
      }
    }
    return newPath;
  };

  useEffect(() => {
    if (view !== "race" || paths.length === 0) return;

    // 등수별 목표 도착 시간 계산
    const durationsByRank = new Array(players.length);
    for (let i = 0; i < players.length; i++) {
       if (i === 0) {
          durationsByRank[i] = 10000 + Math.random() * 1000; 
       } else if (i === players.length - penaltyCount) {
          // 💡 생존 턱걸이(마지막 안전권)와 첫 당첨자 사이를 0.05초(50ms) 차이로 만들어 극적 연출!
          durationsByRank[i] = durationsByRank[i-1] + 50; 
       } else {
          durationsByRank[i] = durationsByRank[i-1] + 1500 + Math.random() * 1000;
       }
    }

    const durations = players.map(p => durationsByRank[ranks.indexOf(p.id)]);

    let virtualTime = 0;
    let lastRealTime = performance.now();

    const animate = (time: number) => {
      const deltaReal = time - lastRealTime;
      lastRealTime = time;

      // 아직 달리고 있는 사람 수 체크
      let runningCount = 0;
      players.forEach((p, i) => {
         if (virtualTime < durations[i]) runningCount++;
      });

      // 생존자가 모두 도착했고, 꼴찌 그룹(당첨자들)의 첫 번째 사람 도착이 1초(1000ms) 이내로 남았을 때 슬로우 모션 발동!
      let shouldSlowMotion = false;
      if (players.length >= 2) {
         // 마지막 안전권 참가자의 ID
         const lastSafeId = ranks[ranks.length - penaltyCount - 1];
         if (lastSafeId) {
           const lastSafeIndex = players.findIndex(p => p.id === lastSafeId);
           const lastSafeDuration = durations[lastSafeIndex];
           
           // 운명의 순간(안전권 마지막 사람과 첫 당첨자가 갈리는 0.05초 구간) 전후로만 슬로우 모션 발동
           // 마지막 안전권 참가자 도착 1초 전부터 ~ 첫 당첨자(0.05초 후 도착) 도착 후 0.2초까지만 발동
           if (virtualTime >= lastSafeDuration - 1000 && virtualTime <= lastSafeDuration + 200) {
             shouldSlowMotion = true;
           }
         }
      }
      
      let speedFactor = 1.0;
      if (shouldSlowMotion) {
         speedFactor = 0.15; // 남은 1초(가상시간)가 현실에서 약 6~7초의 쫄깃한 시간으로 변함
      }
      setIsSlowMotion(shouldSlowMotion);

      virtualTime += deltaReal * speedFactor;

      let allFinished = true;
      let newlyFinished = false;

      const newPositions = players.map((p, i) => {
        const path = paths[i];
        if (!path || path.length === 0) return {x: 0, y: 0};

        const duration = durations[i];
        const progress = Math.min(1, Math.max(0, virtualTime / duration));
        
        if (progress < 1) allFinished = false;

        // 결승선 통과 체크 및 순위표 기록
        if (progress >= 1) {
           const alreadyFinished = finishedPlayersRef.current.find(f => f.id === p.id);
           if (!alreadyFinished) {
              finishedPlayersRef.current.push({ id: p.id, time: duration / 1000 });
              newlyFinished = true;
           }
        }

        const floatIndex = progress * (path.length - 1);
        const idx = Math.floor(floatIndex);
        const nextIdx = Math.min(idx + 1, path.length - 1);
        const t = floatIndex - idx;

        const x = path[idx][0] + (path[nextIdx][0] - path[idx][0]) * t;
        const y = path[idx][1] + (path[nextIdx][1] - path[idx][1]) * t;

        return { x, y };
      });

      setPlayerPositions(newPositions);

      if (newlyFinished) {
        // 상태 업데이트로 UI 반영
        setLeaderboard([...finishedPlayersRef.current]);
      }

      if (allFinished) {
        setTimeout(() => setView("result"), 2000); // 모두 들어오고 여운을 위해 2초 대기
      } else {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [view, paths, ranks, players]);

  useEffect(() => {
    if (view !== "race") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const parent = canvas.parentElement;
    if (!parent) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    const cellW = (rect.width * 0.95) / MAZE_WIDTH;
    const cellH = (rect.height * 0.95) / MAZE_HEIGHT;
    const cellSize = Math.min(cellW, cellH);

    const drawWidth = cellSize * MAZE_WIDTH;
    const drawHeight = cellSize * MAZE_HEIGHT;
    
    canvas.width = drawWidth * dpr;
    canvas.height = drawHeight * dpr;
    
    canvas.style.width = `${drawWidth}px`;
    canvas.style.height = `${drawHeight}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, drawWidth, drawHeight);

    // 깔끔한 블랙/그레이 테마 미로
    for (let y = 0; y < MAZE_HEIGHT; y++) {
      for (let x = 0; x < MAZE_WIDTH; x++) {
        if (maze[y] && maze[y][x] === 1) {
          ctx.fillStyle = "#111827"; // Dark gray walls
          ctx.fillRect(x * cellSize, y * cellSize, cellSize + 0.5, cellSize + 0.5);
        } else {
          ctx.fillStyle = "#f9fafb"; // Light gray paths
          ctx.fillRect(x * cellSize, y * cellSize, cellSize + 0.5, cellSize + 0.5);
        }
      }
    }

    const goalX = Math.floor(MAZE_WIDTH / 2);
    const adjGoalX = goalX % 2 === 0 ? goalX - 1 : goalX;
    ctx.fillStyle = "#ef4444"; 
    ctx.fillRect(adjGoalX * cellSize, (MAZE_HEIGHT - 1) * cellSize, cellSize, cellSize);
    ctx.fillStyle = "white";
    ctx.font = `bold ${cellSize * 0.4}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("GOAL", (adjGoalX + 0.5) * cellSize, (MAZE_HEIGHT - 0.5) * cellSize);

    playerPositions.forEach((pos, i) => {
      if (!pos) return;
      const p = players[i];
      const px = pos.x * cellSize + cellSize / 2;
      const py = pos.y * cellSize + cellSize / 2;

      ctx.beginPath();
      ctx.arc(px, py + cellSize * 0.1, cellSize * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, cellSize * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "white";
      ctx.stroke();

      ctx.font = `${cellSize * 0.5}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.emoji, px, py);

      ctx.font = `bold ${cellSize * 0.45}px sans-serif`;
      const text = p.name;
      const textWidth = ctx.measureText(text).width;
      const tagY = py - cellSize * 0.75;
      
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.beginPath();
      ctx.roundRect(px - textWidth / 2 - 8, tagY - cellSize * 0.25 - 2, textWidth + 16, cellSize * 0.5 + 4, 6);
      ctx.fill();

      ctx.fillStyle = "white";
      ctx.textBaseline = "middle";
      ctx.fillText(text, px, tagY);
    });
  }, [view, maze, playerPositions, players]);

  useEffect(() => {
    // 뷰가 input이나 result일 때 하단 배너 노출
    if (view === "input" || view === "result") {
      try {
        if (typeof TossAds !== "undefined" && TossAds.attachBanner.isSupported()) {
          TossAds.attachBanner(TOSS_AD_BANNER_ID, "#toss-ad-banner");
        }
      } catch (e) {
        console.warn("TossAds banner load failed", e);
      }
    }
  }, [view]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      addPlayer(e as any);
    }
  };

  const handlePlayAgain = () => {
    try {
      if (typeof loadFullScreenAd !== "undefined" && loadFullScreenAd.isSupported()) {
        loadFullScreenAd({
          options: { adGroupId: TOSS_AD_FULLSCREEN_ID },
          onEvent: (event) => {
            if (event.type === "loaded") {
              showFullScreenAd({
                options: { adGroupId: TOSS_AD_FULLSCREEN_ID },
                onEvent: (e) => {
                  if (e.type === "dismissed" || e.type === "failedToShow" || e.type === "userEarnedReward") {
                    setView("input");
                    setPenaltyCount(1);
                  }
                },
                onError: () => {
                  setView("input");
                  setPenaltyCount(1);
                }
              });
            }
          },
          onError: (e) => {
            console.warn("Full screen ad load failed", e);
            setView("input");
            setPenaltyCount(1);
          }
        });
        return; // 광고가 성공적으로 띄워질 예정이므로 여기서 종료
      }
    } catch (e) {
      console.warn("Full screen ad error", e);
    }
    
    // 광고가 지원되지 않거나 에러 시 바로 넘김
    setView("input");
    setPenaltyCount(1);
  };

  return (
    <div className="bg-gray-100 flex flex-col items-center py-4 sm:py-8 px-2 min-h-[100dvh]">
      <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl flex flex-col md:flex-row border border-gray-300" style={{ minHeight: 'calc(100dvh - 2rem)' }}>
        
        {/* 왼쪽(혹은 상단): 메인 컨텐츠 영역 */}
        <div className="flex-1 flex flex-col relative w-full">
          {/* 깔끔한 블랙 헤더 */}
          <div className="bg-gray-900 text-white py-4 px-6 text-center shrink-0 shadow-sm z-10 relative">
            <h1 className="text-xl font-bold tracking-tight text-center">💸 낼래말래 낼래말래? 운빨 미로</h1>
          </div>

          {view === "input" && (
            <div className="p-6 flex-1 flex flex-col bg-white">
              <h2 className="text-lg font-bold mb-4 text-gray-900">누가 낼래? (최대 10명)</h2>
              
              <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <label className="text-sm font-bold text-gray-800">당첨자(결제자) 수</label>
                <div className="flex items-center gap-4">
                  <button 
                    type="button" 
                    onClick={() => setPenaltyCount(Math.max(1, penaltyCount - 1))}
                    disabled={penaltyCount <= 1}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-white border border-gray-300 text-gray-800 font-bold text-xl hover:bg-gray-100 disabled:opacity-30 transition"
                  >
                    -
                  </button>
                  <span className="text-xl font-black text-red-500 w-8 text-center">{penaltyCount}</span>
                  <button 
                    type="button" 
                    onClick={() => setPenaltyCount(Math.min(Math.max(1, players.length - 1), penaltyCount + 1))}
                    disabled={players.length < 2 || penaltyCount >= players.length - 1}
                    className="w-10 h-10 flex items-center justify-center rounded-lg bg-white border border-gray-300 text-gray-800 font-bold text-xl hover:bg-gray-100 disabled:opacity-30 transition"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="이름 입력 (예: 김토스)"
                  className="flex-1 border-2 border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:border-gray-900 text-gray-900 font-medium transition"
                  maxLength={8}
                />
                <button
                  type="button"
                  onClick={addPlayer}
                  disabled={players.length >= 10 || !newName.trim()}
                  className="bg-gray-900 text-white px-6 py-3 rounded-lg font-bold disabled:opacity-30 transition hover:bg-black shadow-sm"
                >
                  추가
                </button>
              </div>

              {players.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 mb-6 font-medium">
                  <span className="text-4xl mb-3">🤔</span>
                  참가자를 추가해주세요!
                </div>
              ) : (
                <ul className="flex-1 overflow-y-auto space-y-3 mb-6 text-black pr-2">
                  {players.map((p) => (
                    <li key={p.id} className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm transition hover:shadow-md">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-lg border border-gray-300 shadow-sm"
                          style={{ backgroundColor: p.color }}
                        >
                          {p.emoji}
                        </div>
                        <span className="font-bold text-gray-800">{p.name}</span>
                      </div>
                      <button
                        onClick={() => removePlayer(p.id)}
                        className="text-red-500 hover:text-red-700 text-sm font-bold bg-red-50 px-3 py-1.5 rounded-md transition"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                onClick={startRace}
                className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-black transition active:scale-95 shadow-md shrink-0 disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
                disabled={players.length < 2}
              >
                미로 경주 시작!
              </button>
            </div>
          )}

          {view === "race" && (
            <div className="p-2 flex-1 flex flex-col items-center justify-center bg-gray-100 w-full h-full overflow-hidden relative">
              <canvas
                ref={canvasRef}
                className="bg-white rounded-lg shadow-md border border-gray-200"
              />
            </div>
          )}

          {view === "result" && (
            <div className="p-6 flex-1 flex flex-col items-center justify-start bg-white overflow-y-auto">
              <div className="text-5xl mb-4 mt-6">🏆</div>
              <h2 className="text-2xl font-black text-gray-900 mb-8">
                최종 결과
              </h2>
              
              <div className="w-full max-w-sm space-y-4 mb-8 text-black">
                {ranks.map((id, index) => {
                  const p = players.find((p) => p.id === id)!;
                  const isLoser = index >= ranks.length - penaltyCount;
                  // Get recorded time from leaderboard if available
                  const record = leaderboard.find(l => l.id === p.id);
                  const timeStr = record ? record.time.toFixed(2) + "초" : "-";

                  return (
                    <div
                      key={id}
                      className={`flex items-center p-4 rounded-xl border shadow-sm bg-white transition-all ${
                        index === 0 ? "border-yellow-400 bg-yellow-50 shadow-md" : 
                        isLoser ? "border-red-400 bg-red-50" : "border-gray-200"
                      }`}
                    >
                      <div className="w-10 font-black text-gray-400 text-lg">
                        {index + 1}
                      </div>
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-xl mx-3 shadow-sm border border-gray-300"
                        style={{ backgroundColor: p.color }}
                      >
                        {p.emoji}
                      </div>
                      <div className="flex-1 flex flex-col">
                        <span className="font-bold text-lg text-gray-900">{p.name}</span>
                        <span className="text-xs text-gray-500 font-mono">{timeStr}</span>
                      </div>
                      {isLoser && (
                        <span className="text-sm font-black text-white bg-red-500 px-3 py-1.5 rounded-lg shadow-sm">
                          당첨! 💸
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handlePlayAgain}
                className="w-full max-w-sm bg-gray-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-black transition active:scale-95 shadow-md shrink-0"
              >
                다시 하기
              </button>
            </div>
          )}

          {/* 하단 배너 광고 영역 (대기실, 결과 화면에서 노출) */}
          {(view === "input" || view === "result") && (
            <div id="toss-ad-banner" className="w-full shrink-0 flex items-center justify-center min-h-[60px] bg-gray-50 border-t border-gray-200">
              <span className="text-gray-400 text-xs">광고가 표시되는 영역입니다</span>
            </div>
          )}
        </div>

        {/* 오른쪽(혹은 하단): 실시간 순위표 영역 (race 뷰에서만 보여짐) */}
        {view === "race" && (
          <div className="w-full md:w-72 bg-gray-50 border-t md:border-t-0 md:border-l border-gray-200 flex flex-col shrink-0">
            <div className="bg-gray-200 text-gray-800 py-3 px-4 text-center font-bold text-sm shrink-0">
              실시간 순위표
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* 이미 도착한 사람들 */}
              {leaderboard.map((record, index) => {
                const p = players.find(p => p.id === record.id)!;
                return (
                  <div key={record.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 shadow-sm animate-fade-in-up">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-400 w-4">{index + 1}</span>
                      <span className="text-lg">{p.emoji}</span>
                      <span className="font-bold text-gray-800 text-sm">{p.name}</span>
                    </div>
                    <span className="font-mono text-sm text-blue-600 font-bold">{record.time.toFixed(2)}초</span>
                  </div>
                );
              })}

              {/* 달리고 있는 사람들 */}
              {players.filter(p => !leaderboard.find(l => l.id === p.id)).map(p => (
                <div key={p.id} className="flex items-center justify-between bg-transparent p-3 rounded-lg border border-dashed border-gray-300 opacity-60">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-300 w-4">-</span>
                    <span className="text-lg">{p.emoji}</span>
                    <span className="font-medium text-gray-600 text-sm">{p.name}</span>
                  </div>
                  <span className="text-xs text-gray-400 animate-pulse">달리는 중...</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
