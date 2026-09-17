/**
 * Tests for useGlobalSearch hook - Task 1.2 verification
 *
 * Validates that the search function works correctly with local state instead of store state:
 * 1. Search function compatibility with local state (useState arrays)
 * 2. All search categories work correctly (students, staff, departments, subjects)
 * 3. Archived student filtering (!s.archivedAt)
 * 4. Search result format and structure
 * 5. Loading state handling
 * 6. Search performance
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useGlobalSearch } from '@/lib/hooks/useGlobalSearch';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock data
const mockStudents = [
  {
    id: 'student-1',
    admissionNumber: 'ADM001',
    fullName: 'John Doe',
    dateOfBirth: new Date('2010-01-01'),
    classId: 'class-1',
    parentName: 'Jane Doe',
    parentContact: '+254700000001',
    schoolId: 'school-1',
    archivedAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'student-2',
    admissionNumber: 'ADM002',
    fullName: 'Alice Smith',
    dateOfBirth: new Date('2010-06-15'),
    classId: 'class-2',
    parentName: 'Bob Smith',
    parentContact: '+254700000002',
    schoolId: 'school-1',
    archivedAt: '2024-01-15T00:00:00Z', // This student is archived
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'student-3',
    admissionNumber: 'ADM003',
    fullName: 'Michael Johnson',
    dateOfBirth: new Date('2011-03-20'),
    classId: 'class-1',
    parentName: 'Sarah Johnson',
    parentContact: '+254700000003',
    schoolId: 'school-1',
    archivedAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

const mockTeachers = [
  {
    id: 'teacher-1',
    staffId: 'STAFF001',
    fullName: 'Dr. Mary Wilson',
    email: 'mary.wilson@school.com',
    phone: '+254700000101',
    primaryDepartmentId: 'dept-1',
    todEligible: true,
    schoolId: 'school-1',
    userId: 'user-1',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'teacher-2',
    staffId: 'STAFF002',
    fullName: 'Prof. James Brown',
    email: 'james.brown@school.com',
    phone: '+254700000102',
    primaryDepartmentId: 'dept-2',
    todEligible: true,
    schoolId: 'school-1',
    userId: 'user-2',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

const mockDepartments = [
  {
    id: 'dept-1',
    name: 'Mathematics Department',
    headTeacherId: 'teacher-1',
    schoolId: 'school-1',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'dept-2',
    name: 'Science Department',
    headTeacherId: 'teacher-2',
    schoolId: 'school-1',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

const mockSubjects = [
  {
    id: 'subject-1',
    name: 'Mathematics',
    code: 'MATH',
    type: 'core',
    departmentId: 'dept-1',
    applicableForms: [1, 2, 3, 4],
    schoolId: 'school-1',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'subject-2',
    name: 'Physics',
    code: 'PHY',
    type: 'core',
    departmentId: 'dept-2',
    applicableForms: [3, 4],
    schoolId: 'school-1',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

describe('useGlobalSearch Hook - Task 1.2 Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default successful API responses.
    //
    // Students are no longer fetched with a bare '/api/students'. The hook goes
    // through fetchAllStudents(), which pages '/api/students?limit=500' and
    // follows the X-Next-Cursor response header, so this mock matches on prefix
    // and must expose `headers` — returning no cursor ends the loop at one page.
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/students')) {
        return Promise.resolve({
          ok: true,
          headers: { get: () => null },
          json: () => Promise.resolve(mockStudents),
        });
      }
      switch (url) {
        case '/api/staff':
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTeachers),
          });
        case '/api/departments':
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockDepartments),
          });
        case '/api/subjects':
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockSubjects),
          });
        default:
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ error: 'Not found' }),
          });
      }
    });
  });

  describe('Local State Management', () => {
    it('should fetch data from APIs and store in local state', async () => {
      const { result } = renderHook(() => useGlobalSearch('', 'principal'));

      // Initially loading
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 3000 });

      // Verify API calls were made. Students go through the paginated helper,
      // so assert on the paged URL rather than a bare '/api/students'.
      expect(mockFetch).toHaveBeenCalledWith('/api/students?limit=500', { cache: 'no-store' });
      expect(mockFetch).toHaveBeenCalledWith('/api/staff');
      expect(mockFetch).toHaveBeenCalledWith('/api/departments');
      expect(mockFetch).toHaveBeenCalledWith('/api/subjects');
    });

    it('should handle API failures gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useGlobalSearch('', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should not crash, returns empty results
      expect(result.current.results).toEqual([]);
    });
  });

  describe('Search Functionality', () => {
    it('should return empty results when query is empty', async () => {
      const { result } = renderHook(() => useGlobalSearch('', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.results).toEqual([]);
      expect(result.current.totalCount).toBe(0);
    });

    it('should return empty results when still loading', async () => {
      const { result } = renderHook(() => useGlobalSearch('john', 'principal'));

      // While loading, should return empty results
      expect(result.current.loading).toBe(true);
      expect(result.current.results).toEqual([]);
    });

    it('should search students by full name', async () => {
      const { result } = renderHook(() => useGlobalSearch('john doe', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const studentGroups = result.current.results.filter(g => g.category === 'students');
      expect(studentGroups).toHaveLength(1);
      
      const studentResults = studentGroups[0].results;
      expect(studentResults).toHaveLength(1);
      expect(studentResults[0].label).toBe('John Doe');
      expect(studentResults[0].detail).toBe('Adm: ADM001');
      expect(studentResults[0].href).toBe('/principal/students/student-1');
      expect(studentResults[0].icon).toBe('GraduationCap');
    });

    it('should search students by admission number', async () => {
      const { result } = renderHook(() => useGlobalSearch('ADM003', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const studentGroups = result.current.results.filter(g => g.category === 'students');
      expect(studentGroups).toHaveLength(1);
      expect(studentGroups[0].results[0].label).toBe('Michael Johnson');
    });

    it('should search students by parent name', async () => {
      const { result } = renderHook(() => useGlobalSearch('jane doe', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const studentGroups = result.current.results.filter(g => g.category === 'students');
      expect(studentGroups).toHaveLength(1);
      expect(studentGroups[0].results[0].label).toBe('John Doe');
    });
  });

  describe('Archived Student Filtering', () => {
    it('should exclude archived students from search results', async () => {
      const { result } = renderHook(() => useGlobalSearch('alice', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Alice Smith is archived, so should not appear in results
      const studentGroups = result.current.results.filter(g => g.category === 'students');
      expect(studentGroups).toHaveLength(0);
    });

    it('should include only active students in search', async () => {
      const { result } = renderHook(() => useGlobalSearch('doe', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const studentGroups = result.current.results.filter(g => g.category === 'students');
      expect(studentGroups).toHaveLength(1);
      
      // Only John Doe should appear (not Alice Smith who is archived)
      const studentResults = studentGroups[0].results;
      expect(studentResults).toHaveLength(1);
      expect(studentResults[0].label).toBe('John Doe');
    });
  });

  describe('Staff Search', () => {
    it('should search staff by full name', async () => {
      const { result } = renderHook(() => useGlobalSearch('mary', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const staffGroups = result.current.results.filter(g => g.category === 'staff');
      expect(staffGroups).toHaveLength(1);
      
      const staffResults = staffGroups[0].results;
      expect(staffResults).toHaveLength(1);
      expect(staffResults[0].label).toBe('Dr. Mary Wilson');
      expect(staffResults[0].detail).toBe('Staff ID: STAFF001');
      expect(staffResults[0].href).toBe('/principal/staff/teacher-1');
      expect(staffResults[0].icon).toBe('UserCheck');
    });

    it('should search staff by staff ID', async () => {
      const { result } = renderHook(() => useGlobalSearch('STAFF002', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const staffGroups = result.current.results.filter(g => g.category === 'staff');
      expect(staffGroups).toHaveLength(1);
      expect(staffGroups[0].results[0].label).toBe('Prof. James Brown');
    });

    it('should search staff by email', async () => {
      const { result } = renderHook(() => useGlobalSearch('james.brown', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const staffGroups = result.current.results.filter(g => g.category === 'staff');
      expect(staffGroups).toHaveLength(1);
      expect(staffGroups[0].results[0].label).toBe('Prof. James Brown');
    });
  });

  describe('Department Search', () => {
    it('should search departments by name', async () => {
      const { result } = renderHook(() => useGlobalSearch('mathematics', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const deptGroups = result.current.results.filter(g => g.category === 'departments');
      expect(deptGroups).toHaveLength(1);
      
      const deptResults = deptGroups[0].results;
      expect(deptResults).toHaveLength(1);
      expect(deptResults[0].label).toBe('Mathematics Department');
      expect(deptResults[0].href).toBe('/principal/departments');
      expect(deptResults[0].icon).toBe('Layers');
    });
  });

  describe('Subject Search', () => {
    it('should search subjects by name', async () => {
      const { result } = renderHook(() => useGlobalSearch('physics', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const subjectGroups = result.current.results.filter(g => g.category === 'subjects');
      expect(subjectGroups).toHaveLength(1);
      
      const subjectResults = subjectGroups[0].results;
      expect(subjectResults).toHaveLength(1);
      expect(subjectResults[0].label).toBe('Physics');
      expect(subjectResults[0].href).toBe('/principal/subjects');
      expect(subjectResults[0].icon).toBe('BookMarked');
    });
  });

  describe('Navigation and Actions Search', () => {
    it('should find navigation pages by label', async () => {
      const { result } = renderHook(() => useGlobalSearch('students', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const navGroups = result.current.results.filter(g => g.category === 'navigation');
      expect(navGroups.length).toBeGreaterThan(0);
      
      const studentsNav = navGroups[0].results.find(r => r.label === 'Students');
      expect(studentsNav).toBeDefined();
      expect(studentsNav?.href).toBe('/principal/students');
    });

    it('should find quick actions by label', async () => {
      const { result } = renderHook(() => useGlobalSearch('register student', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const actionGroups = result.current.results.filter(g => g.category === 'actions');
      expect(actionGroups.length).toBeGreaterThan(0);
      
      const registerAction = actionGroups[0].results.find(r => r.label === 'Register Student');
      expect(registerAction).toBeDefined();
    });

    it('should respect role-based access for navigation', async () => {
      const { result: principalResult } = renderHook(() => useGlobalSearch('staff', 'principal'));
      const { result: teacherResult } = renderHook(() => useGlobalSearch('staff', 'teacher'));

      await waitFor(() => {
        expect(principalResult.current.loading).toBe(false);
        expect(teacherResult.current.loading).toBe(false);
      });

      // Principal should see staff navigation
      const principalNavGroups = principalResult.current.results.filter(g => g.category === 'navigation');
      const principalHasStaffNav = principalNavGroups.some(g => 
        g.results.some(r => r.label === 'Staff')
      );
      expect(principalHasStaffNav).toBe(true);

      // Teacher should not see staff navigation (not in their role permissions)
      const teacherNavGroups = teacherResult.current.results.filter(g => g.category === 'navigation');
      const teacherHasStaffNav = teacherNavGroups.some(g => 
        g.results.some(r => r.label === 'Staff')
      );
      expect(teacherHasStaffNav).toBe(false);
    });
  });

  describe('Search Result Format', () => {
    it('should return properly formatted search result groups', async () => {
      const { result } = renderHook(() => useGlobalSearch('john', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: expect.stringMatching(/^(students|staff|departments|subjects|navigation|actions)$/),
            label: expect.any(String),
            icon: expect.any(String),
            results: expect.arrayContaining([
              expect.objectContaining({
                id: expect.any(String),
                category: expect.stringMatching(/^(students|staff|departments|subjects|navigation|actions)$/),
                label: expect.any(String),
                href: expect.any(String),
                icon: expect.any(String),
                detail: expect.any(String),
              })
            ])
          })
        ])
      );
    });

    it('should calculate total count correctly', async () => {
      const { result } = renderHook(() => useGlobalSearch('department', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const expectedCount = result.current.results.reduce((acc, group) => acc + group.results.length, 0);
      expect(result.current.totalCount).toBe(expectedCount);
    });
  });

  describe('Search Limits', () => {
    it('should limit student results to 5', async () => {
      // Add more mock students
      const extraStudents = Array.from({ length: 10 }, (_, i) => ({
        ...mockStudents[0],
        id: `student-extra-${i}`,
        admissionNumber: `EXTRA${i.toString().padStart(3, '0')}`,
        fullName: `Test Student ${i}`,
        archivedAt: null,
      }));

      mockFetch.mockImplementation((url: string) => {
        if (url.startsWith('/api/students')) {
          return Promise.resolve({
            ok: true,
            headers: { get: () => null },
            json: () => Promise.resolve([...mockStudents, ...extraStudents]),
          });
        }
        // Return empty for other endpoints to focus on students
        return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve([]) });
      });

      const { result } = renderHook(() => useGlobalSearch('student', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const studentGroups = result.current.results.filter(g => g.category === 'students');
      if (studentGroups.length > 0) {
        expect(studentGroups[0].results.length).toBeLessThanOrEqual(5);
      }
    });

    it('should limit staff results to 5', async () => {
      const extraTeachers = Array.from({ length: 10 }, (_, i) => ({
        ...mockTeachers[0],
        id: `teacher-extra-${i}`,
        staffId: `EXTRA${i.toString().padStart(3, '0')}`,
        fullName: `Test Teacher ${i}`,
      }));

      mockFetch.mockImplementation((url: string) => {
        if (url === '/api/staff') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([...mockTeachers, ...extraTeachers]),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      const { result } = renderHook(() => useGlobalSearch('teacher', 'principal'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const staffGroups = result.current.results.filter(g => g.category === 'staff');
      if (staffGroups.length > 0) {
        expect(staffGroups[0].results.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('Case Insensitive Search', () => {
    it('should perform case-insensitive search', async () => {
      const queries = ['JOHN', 'john', 'John', 'JoHn'];

      for (const query of queries) {
        const { result } = renderHook(() => useGlobalSearch(query, 'principal'));

        await waitFor(() => {
          expect(result.current.loading).toBe(false);
        });

        const studentGroups = result.current.results.filter(g => g.category === 'students');
        expect(studentGroups).toHaveLength(1);
        // Should find John Doe or Michael Johnson (both contain variations of "john")
        const foundStudent = studentGroups[0].results.find(r => r.label === 'John Doe');
        expect(foundStudent).toBeDefined();
      }
    });
  });
});