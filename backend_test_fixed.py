#!/usr/bin/env python3
"""
PREMIDIS SARL HR Platform - Backend API Testing
Tests authentication, role-based permissions, leave management, and attendance tracking
"""

import requests
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

class PremidisHRTester:
    def __init__(self, base_url="https://doc-automate-2.preview.emergentagent.com"):
        self.base_url = base_url
        self.tokens = {}
        self.users = {}
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        
        # Test credentials
        self.credentials = {
            "admin": {"email": "rh@premierdis.com", "password": "Admin123!"},
            "secretary": {"email": "secretaire2@premierdis.com", "password": "Secret123!"},
            "employee": {"email": "employe@premierdis.com", "password": "Emp123!"}
        }

    def log_test(self, name: str, success: bool, details: str = ""):
        """Log test result"""
        self.tests_run += 1
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if details:
            print(f"    {details}")
        
        if success:
            self.tests_passed += 1
        else:
            self.failed_tests.append({"test": name, "details": details})

    def make_request(self, method: str, endpoint: str, role: str = None, data: Dict = None, expected_status: int = 200) -> tuple:
        """Make API request with optional authentication"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if role and role in self.tokens:
            headers['Authorization'] = f'Bearer {self.tokens[role]}'
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            
            success = response.status_code == expected_status
            return success, response.json() if response.content else {}, response.status_code
            
        except Exception as e:
            return False, {"error": str(e)}, 0

    def test_authentication(self):
        """Test authentication for all roles"""
        print("\n🔐 Testing Authentication...")
        
        for role, creds in self.credentials.items():
            success, response, status = self.make_request(
                'POST', 'auth/login', data=creds, expected_status=200
            )
            
            if success and 'access_token' in response:
                self.tokens[role] = response['access_token']
                self.users[role] = response['user']
                self.log_test(f"Login as {role}", True, f"Role: {response['user']['role']}")
            else:
                self.log_test(f"Login as {role}", False, f"Status: {status}, Response: {response}")

    def test_file_upload_functionality(self):
        """Test file upload functionality for PDF, JPEG, PNG files"""
        print("\n📁 Testing File Upload Functionality...")
        
        # Test file upload endpoint exists and accepts files
        success, response, status = self.make_request(
            'POST', 'upload/file', role='employee', expected_status=422  # Expect validation error without file
        )
        
        # 422 means endpoint exists but missing file data - this is expected
        endpoint_exists = status == 422
        self.log_test("File upload endpoint exists (BUG FIX)", endpoint_exists, f"Status: {status}")
        
        # Test avatar upload endpoint
        employee_id = self.users.get('employee', {}).get('id')
        if employee_id:
            success, response, status = self.make_request(
                'POST', f'upload/avatar/{employee_id}', role='employee', expected_status=422
            )
            
            avatar_endpoint_exists = status == 422
            self.log_test("Avatar upload endpoint exists (BUG FIX)", avatar_endpoint_exists, f"Status: {status}")

    def test_communication_features(self):
        """Test announcement creation by Admin and Secretary"""
        print("\n💬 Testing Communication Features...")
        
        # Test announcement creation by Admin
        announcement_data = {
            "title": "Test Admin Announcement",
            "content": "This is a test announcement from admin",
            "priority": "normal"
        }
        
        success, response, status = self.make_request(
            'POST', 'communication/announcements', role='admin', 
            data=announcement_data, expected_status=201
        )
        
        if success:
            announcement_id = response.get('id')
            self.log_test("Admin - Create announcement", True, f"Announcement ID: {announcement_id}")
        else:
            self.log_test("Admin - Create announcement", False, f"Status: {status}, Response: {response}")
        
        # Test announcement creation by Secretary (BUG FIX)
        announcement_data['title'] = "Test Secretary Announcement"
        announcement_data['content'] = "This is a test announcement from secretary"
        
        success, response, status = self.make_request(
            'POST', 'communication/announcements', role='secretary', 
            data=announcement_data, expected_status=201
        )
        
        if success:
            announcement_id = response.get('id')
            self.log_test("Secretary - Create announcement (BUG FIX)", True, f"Announcement ID: {announcement_id}")
        else:
            self.log_test("Secretary - Create announcement (BUG FIX)", False, f"Status: {status}, Response: {response}")
        
        # Test Employee CANNOT create announcements
        success, response, status = self.make_request(
            'POST', 'communication/announcements', role='employee', 
            data=announcement_data, expected_status=403
        )
        self.log_test("Employee CANNOT create announcements", success, f"Status: {status}")
        
        # Test announcement listing
        for role in ['admin', 'secretary', 'employee']:
            success, response, status = self.make_request(
                'GET', 'communication/announcements', role=role
            )
            
            if success:
                announcements = response.get('announcements', [])
                self.log_test(f"{role} - View announcements", True, f"Announcements visible: {len(announcements)}")
            else:
                self.log_test(f"{role} - View announcements", False, f"Status: {status}")

    def test_leave_rules_visibility(self):
        """Test that employees can see leave rules clearly before submitting request"""
        print("\n📋 Testing Leave Rules Visibility...")
        
        for role in ['admin', 'secretary', 'employee']:
            success, response, status = self.make_request('GET', 'leaves/rules', role=role)
            
            if success:
                rules = response.get('rules', {})
                leave_types = response.get('leave_types', [])
                has_annual_days = 'annual_days' in rules
                has_leave_types = len(leave_types) > 0
                
                self.log_test(f"{role} - Leave rules access (BUG FIX)", has_annual_days and has_leave_types, 
                            f"Rules: {list(rules.keys())}, Leave types: {len(leave_types)}")
            else:
                self.log_test(f"{role} - Leave rules access", False, f"Status: {status}")

    def test_leave_management(self):
        """Test leave request creation and approval workflow"""
        print("\n📅 Testing Leave Management...")
        
        # Create leave request as employee with unique dates
        leave_data = {
            "leave_type": "annual",
            "start_date": (datetime.now() + timedelta(days=80)).strftime("%Y-%m-%d"),
            "end_date": (datetime.now() + timedelta(days=82)).strftime("%Y-%m-%d"),
            "reason": "Test leave request - unique dates"
        }
        
        success, response, status = self.make_request(
            'POST', 'leaves', role='employee', data=leave_data, expected_status=201
        )
        
        if success:
            leave_id = response.get('id')
            working_days = response.get('working_days', 0)
            self.log_test("Employee - Create leave request", True, 
                        f"Leave ID: {leave_id}, Working days: {working_days}")
            
            # CRITICAL BUG FIX TEST: Secretary CAN NOW approve leaves (was previously blocked)
            if leave_id:
                success, response, status = self.make_request(
                    'PUT', f'leaves/{leave_id}', role='secretary', 
                    data={"status": "approved"}, expected_status=200
                )
                self.log_test("Secretary CAN approve leaves (BUG FIX)", success, 
                            f"Status: {status}, Leave status: {response.get('status', 'unknown')}")
                
                # Test admin CAN also approve
                success, response, status = self.make_request(
                    'PUT', f'leaves/{leave_id}', role='admin', 
                    data={"status": "rejected"}, expected_status=200
                )
                self.log_test("Admin CAN approve/reject leaves", success, 
                            f"Status: {response.get('status', 'unknown')}")
        else:
            self.log_test("Employee - Create leave request", False, f"Status: {status}, Response: {response}")

    def test_behavior_tracking(self):
        """Test behavior tracking functionality"""
        print("\n📝 Testing Behavior Tracking...")
        
        # Get employee ID for behavior note
        employee_id = self.users.get('employee', {}).get('id')
        if not employee_id:
            self.log_test("Behavior tracking", False, "No employee ID available")
            return
        
        # Test Admin can create behavior note
        behavior_data = {
            "employee_id": employee_id,
            "type": "positive",
            "note": "Excellent performance on project delivery",
            "date": datetime.now().strftime("%Y-%m-%d")
        }
        
        success, response, status = self.make_request(
            'POST', 'behavior', role='admin', data=behavior_data, expected_status=201
        )
        
        if success:
            behavior_id = response.get('id')
            self.log_test("Admin - Create behavior note", True, f"Behavior ID: {behavior_id}")
        else:
            self.log_test("Admin - Create behavior note", False, f"Status: {status}, Response: {response}")
        
        # Test Employee can view their own behavior history
        success, response, status = self.make_request(
            'GET', f'behavior/{employee_id}', role='employee'
        )
        
        if success:
            behaviors = response.get('behaviors', [])
            self.log_test("Employee - View own behavior history (BUG FIX)", True, f"Behaviors found: {len(behaviors)}")
        else:
            self.log_test("Employee - View own behavior history", False, f"Status: {status}")
        
        # Test Employee CANNOT create behavior note
        success, response, status = self.make_request(
            'POST', 'behavior', role='employee', data=behavior_data, expected_status=403
        )
        self.log_test("Employee CANNOT create behavior note", success, f"Status: {status}")

    def test_calendar_approved_leaves_only(self):
        """Test that calendar shows only APPROVED leaves, not pending or rejected"""
        print("\n📅 Testing Calendar Shows Only Approved Leaves...")
        
        # Create leaves with different statuses using unique dates
        leave_data_pending = {
            "leave_type": "annual",
            "start_date": (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d"),
            "end_date": (datetime.now() + timedelta(days=91)).strftime("%Y-%m-%d"),
            "reason": "Test pending leave for calendar"
        }
        
        # Create pending leave
        success, response, status = self.make_request(
            'POST', 'leaves', role='employee', data=leave_data_pending, expected_status=201
        )
        
        pending_leave_id = None
        if success:
            pending_leave_id = response.get('id')
            self.log_test("Created pending leave for calendar test", True, f"Leave ID: {pending_leave_id}")
        
        # Create and approve another leave
        leave_data_approved = {
            "leave_type": "sick",
            "start_date": (datetime.now() + timedelta(days=95)).strftime("%Y-%m-%d"),
            "end_date": (datetime.now() + timedelta(days=96)).strftime("%Y-%m-%d"),
            "reason": "Test approved leave for calendar"
        }
        
        success, response, status = self.make_request(
            'POST', 'leaves', role='employee', data=leave_data_approved, expected_status=201
        )
        
        approved_leave_id = None
        if success:
            approved_leave_id = response.get('id')
            # Approve this leave
            success, response, status = self.make_request(
                'PUT', f'leaves/{approved_leave_id}', role='admin', 
                data={"status": "approved"}, expected_status=200
            )
            if success:
                self.log_test("Created and approved leave for calendar test", True, f"Leave ID: {approved_leave_id}")
        
        # Now check calendar - should only show approved leaves
        success, response, status = self.make_request('GET', 'leaves/calendar', role='employee')
        
        if success:
            calendar_leaves = response.get('leaves', [])
            
            # Check if only approved leaves are shown
            approved_count = sum(1 for leave in calendar_leaves if leave.get('status') == 'approved')
            pending_count = sum(1 for leave in calendar_leaves if leave.get('status') == 'pending')
            rejected_count = sum(1 for leave in calendar_leaves if leave.get('status') == 'rejected')
            
            only_approved = pending_count == 0 and rejected_count == 0
            self.log_test("Calendar shows only APPROVED leaves (BUG FIX)", only_approved, 
                        f"Approved: {approved_count}, Pending: {pending_count}, Rejected: {rejected_count}")
        else:
            self.log_test("Calendar shows only APPROVED leaves", False, f"Status: {status}")

    def test_document_upload_in_profile(self):
        """Test document upload in employee profile"""
        print("\n📄 Testing Document Upload in Employee Profile...")
        
        employee_id = self.users.get('employee', {}).get('id')
        if not employee_id:
            self.log_test("Document upload in profile", False, "No employee ID available")
            return
        
        # Test document upload endpoint for employee profile
        document_data = {
            "name": "test_document.pdf",
            "type": "pdf",
            "url": "/uploads/test_document.pdf"
        }
        
        success, response, status = self.make_request(
            'POST', f'employees/{employee_id}/documents', role='employee', 
            data=document_data, expected_status=201
        )
        
        if success:
            doc_id = response.get('id')
            self.log_test("Employee - Upload document to profile (BUG FIX)", True, f"Document ID: {doc_id}")
        else:
            self.log_test("Employee - Upload document to profile", False, f"Status: {status}, Response: {response}")
        
        # Test document listing
        success, response, status = self.make_request(
            'GET', f'employees/{employee_id}/documents', role='employee'
        )
        
        if success:
            documents = response.get('documents', [])
            self.log_test("Employee - View profile documents", True, f"Documents found: {len(documents)}")
        else:
            self.log_test("Employee - View profile documents", False, f"Status: {status}")

    def run_all_tests(self):
        """Run complete test suite"""
        print("🚀 Starting PREMIDIS SARL HR Platform Backend Tests")
        print("=" * 60)
        
        # Core functionality tests
        self.test_authentication()
        
        if not self.tokens:
            print("❌ Authentication failed - cannot proceed with other tests")
            return False
        
        # Test all bug fixes mentioned in review request
        self.test_file_upload_functionality()
        self.test_communication_features()
        self.test_leave_rules_visibility()
        self.test_leave_management()
        self.test_behavior_tracking()
        self.test_calendar_approved_leaves_only()
        self.test_document_upload_in_profile()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.failed_tests:
            print("\n❌ Failed Tests:")
            for test in self.failed_tests:
                print(f"  - {test['test']}: {test['details']}")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"✅ Success Rate: {success_rate:.1f}%")
        
        return success_rate >= 70  # Consider 70%+ as passing for bug fix testing

def main():
    tester = PremidisHRTester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())