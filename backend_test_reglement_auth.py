#!/usr/bin/env python3
"""
Test role-based access and authentication for Reglement API
Testing with exact credentials from review request
"""

import requests
import sys

class ReglementAuthTester:
    def __init__(self):
        self.base_url = "https://6f2abe55-4e3a-4e8c-a63d-8b827fce0381.preview.emergentagent.com"
        self.tests_run = 0
        self.tests_passed = 0

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")

    def test_super_admin_access(self):
        """Test super admin access with exact credentials from review"""
        print("\n🔐 Testing Super Admin Access...")
        
        # Exact credentials from review request
        login_data = {
            "email": "superadmin@premierdis.com",
            "password": "SuperAdmin123!"
        }
        
        try:
            url = f"{self.base_url}/api/auth/login"
            response = requests.post(url, json=login_data, headers={'Content-Type': 'application/json'})
            
            if response.status_code == 200:
                response_data = response.json()
                if 'access_token' in response_data:
                    token = response_data['access_token']
                    user = response_data.get('user', {})
                    
                    self.log_test(
                        "Super Admin Login with exact credentials",
                        True,
                        f"Role: {user.get('role', 'unknown')}"
                    )
                    
                    # Test access to reglement endpoints
                    headers = {'Authorization': f'Bearer {token}'}
                    
                    # Test GET access
                    get_response = requests.get(f"{self.base_url}/api/communication/reglement", headers=headers)
                    self.log_test(
                        "Super Admin can access GET /api/communication/reglement",
                        get_response.status_code == 200,
                        f"Status: {get_response.status_code}"
                    )
                    
                    # Test POST access (upload)
                    test_pdf = b'%PDF-1.4\nTest PDF'
                    files = {'file': ('test.pdf', test_pdf, 'application/pdf')}
                    post_response = requests.post(f"{self.base_url}/api/communication/reglement", files=files, headers=headers)
                    
                    upload_success = post_response.status_code == 200
                    self.log_test(
                        "Super Admin can upload documents (POST)",
                        upload_success,
                        f"Status: {post_response.status_code}"
                    )
                    
                    # If upload succeeded, test DELETE
                    if upload_success:
                        try:
                            upload_data = post_response.json()
                            doc_id = upload_data.get('document', {}).get('id')
                            if doc_id:
                                delete_response = requests.delete(f"{self.base_url}/api/communication/reglement/{doc_id}", headers=headers)
                                self.log_test(
                                    "Super Admin can delete documents (DELETE)",
                                    delete_response.status_code == 200,
                                    f"Status: {delete_response.status_code}"
                                )
                        except:
                            self.log_test("Super Admin can delete documents (DELETE)", False, "Could not extract document ID")
                    
                    return token
                else:
                    self.log_test("Super Admin Login", False, "No access_token in response")
            else:
                self.log_test("Super Admin Login", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_test("Super Admin Login", False, f"Exception: {str(e)}")
        
        return None

    def test_unauthorized_access(self):
        """Test unauthorized access (no token)"""
        print("\n🚫 Testing Unauthorized Access...")
        
        # Test GET without token
        get_response = requests.get(f"{self.base_url}/api/communication/reglement")
        self.log_test(
            "GET reglement without token (should fail)",
            get_response.status_code == 401,
            f"Status: {get_response.status_code} (expected 401)"
        )
        
        # Test POST without token
        test_pdf = b'%PDF-1.4\nTest PDF'
        files = {'file': ('test.pdf', test_pdf, 'application/pdf')}
        post_response = requests.post(f"{self.base_url}/api/communication/reglement", files=files)
        self.log_test(
            "POST reglement without token (should fail)",
            post_response.status_code == 401,
            f"Status: {post_response.status_code} (expected 401)"
        )

    def test_invalid_token(self):
        """Test with invalid token"""
        print("\n🔒 Testing Invalid Token...")
        
        headers = {'Authorization': 'Bearer invalid_token_12345'}
        
        # Test GET with invalid token
        get_response = requests.get(f"{self.base_url}/api/communication/reglement", headers=headers)
        self.log_test(
            "GET reglement with invalid token (should fail)",
            get_response.status_code == 401,
            f"Status: {get_response.status_code} (expected 401)"
        )

    def run_auth_tests(self):
        """Run all authentication tests"""
        print("🔐 Testing Authentication & Authorization for Reglement API")
        print("=" * 60)
        
        # Test super admin access
        token = self.test_super_admin_access()
        
        # Test unauthorized access
        self.test_unauthorized_access()
        
        # Test invalid token
        self.test_invalid_token()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 AUTHENTICATION TEST SUMMARY")
        print("=" * 60)
        print(f"Total tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        return self.tests_passed == self.tests_run

if __name__ == "__main__":
    tester = ReglementAuthTester()
    success = tester.run_auth_tests()
    sys.exit(0 if success else 1)