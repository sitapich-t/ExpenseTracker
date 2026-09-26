import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GroupContext = createContext();

const STORAGE_KEY = 'EXPENSE_TRACKER_GROUPS';

export const INITIAL_GROUPS = [
  {
    id: '1',
    name: 'ทริปหัวหิน 2026 🏖️',
    description: 'ทริปเที่ยวทะเลกับเพื่อนสนิท',
    category: 'ท่องเที่ยว',
    color: '#7C3AED',
    members: [
      { id: '1', name: 'นนท์ (ฉัน)', color: '#EF4444' },
      { id: '2', name: 'พลอย', color: '#10B981' },
      { id: '3', name: 'เตีย', color: '#F59E0B' },
      { id: '4', name: 'มาร์ช', color: '#8B5CF6' },
    ],
    bills: [
      {
        id: 'b1_1',
        title: 'ค่าอาหารค่ำซีฟู้ด 🦐',
        payer: 'พลอย',
        splitText: 'แชร์ทุกคน',
        amount: '5,400',
      },
      {
        id: 'b1_2',
        title: 'ค่าที่พักพูลวิลล่า 🌴',
        payer: 'เตีย',
        splitText: 'แชร์ทุกคน',
        amount: '4,000',
      },
      {
        id: 'b1_3',
        title: 'ค่าน้ำมันรถเดินทาง 🚗',
        payer: 'มาร์ช',
        splitText: 'แชร์ทุกคน',
        amount: '3,000',
      },
    ],
  },
  {
    id: '2',
    name: 'แชร์ค่าบ้านพัก พัทยา 🌴',
    description: 'พูลวิลล่าสังสรรค์วันหยุด',
    category: 'ที่พัก / หอพัก',
    color: '#F97316',
    members: [
      { id: '1', name: 'นนท์ (ฉัน)', color: '#EF4444' },
      { id: '2', name: 'เจมส์', color: '#3B82F6' },
      { id: '3', name: 'แนน', color: '#10B981' },
    ],
    bills: [
      {
        id: 'b2_1',
        title: 'ค่าบ้านพักพูลวิลล่า พัทยา',
        payer: 'เจมส์',
        splitText: 'แชร์ทุกคน',
        amount: '4,500',
      },
    ],
  },
  {
    id: '3',
    name: 'มื้อเที่ยงออฟฟิศ ☕',
    description: 'รวมค่ากาแฟและอาหารกลางวันประจำสัปดาห์',
    category: 'อาหารและเครื่องดื่ม',
    color: '#8B5CF6',
    members: [
      { id: '1', name: 'นนท์ (ฉัน)', color: '#EF4444' },
      { id: '2', name: 'บอส', color: '#8B5CF6' },
      { id: '3', name: 'เคน', color: '#3B82F6' },
    ],
    bills: [
      {
        id: 'b3_1',
        title: 'ค่ากาแฟและอาหารกลางวัน',
        payer: 'นนท์ (ฉัน)',
        splitText: 'แชร์ทุกคน',
        amount: '840',
      },
    ],
    settled: true,
  },
];

export function GroupProvider({ children }) {
  const [groups, setGroups] = useState(INITIAL_GROUPS);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setGroups(parsed);
        }
      }
    } catch (e) {
      console.log('Error loading groups:', e);
    }
  };

  const saveGroups = async (updated) => {
    setGroups(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.log('Error saving groups:', e);
    }
  };

  const addGroup = (newGroup) => {
    const groupWithId = {
      id: String(Date.now()),
      bills: [],
      members: [
        { id: '1', name: 'นนท์ (ฉัน)', color: '#EF4444' },
        { id: '2', name: 'เพื่อน 1', color: '#10B981' },
        { id: '3', name: 'เพื่อน 2', color: '#3B82F6' },
      ],
      ...newGroup,
    };
    const updated = [groupWithId, ...groups];
    saveGroups(updated);
    return groupWithId;
  };

  const addGroupBill = (groupId, bill) => {
    const updated = groups.map((g) => {
      if (g.id === groupId) {
        const currentBills = g.bills || [];
        const newBill = {
          id: `b_${Date.now()}`,
          splitText: 'แชร์ทุกคน',
          ...bill,
        };
        return {
          ...g,
          bills: [newBill, ...currentBills],
          settled: false,
        };
      }
      return g;
    });
    saveGroups(updated);
  };

  const settleGroup = (groupId) => {
    const updated = groups.map((g) => {
      if (g.id === groupId) {
        return {
          ...g,
          settled: true,
        };
      }
      return g;
    });
    saveGroups(updated);
  };

  const getGroup = (groupId) => {
    return groups.find((g) => g.id === String(groupId)) || groups[0];
  };

  return (
    <GroupContext.Provider
      value={{
        groups,
        getGroup,
        addGroup,
        addGroupBill,
        settleGroup,
      }}
    >
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup() {
  return useContext(GroupContext);
}
