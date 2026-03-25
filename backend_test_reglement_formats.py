#!/usr/bin/env python3
"""
Additional test for multi-format support in Reglement API
Testing PDF, Images, DOC/DOCX support as mentioned in test_result.md
"""

import requests
import sys
import json

class ReglementMultiFormatTester:
    def __init__(self):
        self.base_url = "https://6f2abe55-4e3a-4e8c-a63d-8b827fce0381.preview.emergentagent.com"
        self.admin_token = None
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

    def get_admin_token(self):
        """Get admin token"""
        login_data = {
            "email": "superadmin@premierdis.com",
            "password": "SuperAdmin123!"
        }
        
        try:
            url = f"{self.base_url}/api/auth/login"
            response = requests.post(url, json=login_data, headers={'Content-Type': 'application/json'})
            
            if response.status_code == 200:
                response_data = response.json()
                self.admin_token = response_data.get('access_token')
                return True
        except Exception as e:
            print(f"❌ Login failed: {str(e)}")
        
        return False

    def create_test_files(self):
        """Create test files for different formats"""
        files = {
            'pdf': {
                'name': 'test_reglement.pdf',
                'content': b'%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\nxref\n0 2\ntrailer\n<<\n/Size 2\n/Root 1 0 R\n>>\nstartxref\n%%EOF',
                'content_type': 'application/pdf'
            },
            'jpg': {
                'name': 'test_image.jpg',
                'content': b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\xff\xc0\x00\x11\x08\x00\x01\x00\x01\x01\x01\x11\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x14\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x08\xff\xc4\x00\x14\x10\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00\x3f\x00\xaa\xff\xd9',
                'content_type': 'image/jpeg'
            },
            'png': {
                'name': 'test_image.png',
                'content': b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\tpHYs\x00\x00\x0b\x13\x00\x00\x0b\x13\x01\x00\x9a\x9c\x18\x00\x00\x00\x0cIDATx\x9cc```\x00\x00\x00\x04\x00\x01\xdd\x8d\xb4\x1c\x00\x00\x00\x00IEND\xaeB`\x82',
                'content_type': 'image/png'
            },
            'docx': {
                'name': 'test_document.docx',
                'content': b'PK\x03\x04\x14\x00\x00\x00\x08\x00\x00\x00!\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x13\x00\x00\x00[Content_Types].xmlPK\x07\x08\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00PK\x01\x02\x14\x00\x14\x00\x00\x00\x08\x00\x00\x00!\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x13\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x80\x01\x00\x00\x00\x00[Content_Types].xmlPK\x05\x06\x00\x00\x00\x00\x01\x00\x01\x00A\x00\x00\x00!\x00\x00\x00\x00\x00',
                'content_type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            }
        }
        return files

    def test_file_format(self, format_name, file_info):
        """Test uploading a specific file format"""
        if not self.admin_token:
            self.log_test(f"Upload {format_name.upper()}", False, "No admin token")
            return None
        
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        files = {
            'file': (file_info['name'], file_info['content'], file_info['content_type'])
        }
        
        try:
            url = f"{self.base_url}/api/communication/reglement"
            response = requests.post(url, files=files, headers=headers)
            
            if response.status_code == 200:
                response_data = response.json()
                document = response_data.get('document', {})
                
                # Verify correct content type and file type
                expected_file_type = 'pdf' if format_name == 'pdf' else ('image' if format_name in ['jpg', 'png'] else 'document')
                actual_file_type = document.get('file_type')
                actual_content_type = document.get('content_type')
                
                if actual_file_type == expected_file_type and actual_content_type == file_info['content_type']:
                    self.log_test(
                        f"Upload {format_name.upper()}",
                        True,
                        f"Successfully uploaded {file_info['name']} as {expected_file_type}"
                    )
                    return document.get('id')
                else:
                    self.log_test(
                        f"Upload {format_name.upper()}",
                        False,
                        f"Wrong file_type: expected {expected_file_type}, got {actual_file_type}"
                    )
            else:
                try:
                    error_detail = response.json().get('detail', 'Unknown error')
                    self.log_test(
                        f"Upload {format_name.upper()}",
                        False,
                        f"Status: {response.status_code}, Error: {error_detail}"
                    )
                except:
                    self.log_test(
                        f"Upload {format_name.upper()}",
                        False,
                        f"Status: {response.status_code}"
                    )
        except Exception as e:
            self.log_test(
                f"Upload {format_name.upper()}",
                False,
                f"Exception: {str(e)}"
            )
        
        return None

    def cleanup_document(self, doc_id):
        """Clean up uploaded document"""
        if not self.admin_token or not doc_id:
            return
        
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        try:
            url = f"{self.base_url}/api/communication/reglement/{doc_id}"
            requests.delete(url, headers=headers)
        except:
            pass

    def run_multi_format_tests(self):
        """Run multi-format tests"""
        print("🎨 Testing Multi-Format Support for Reglement API")
        print("=" * 50)
        
        if not self.get_admin_token():
            print("❌ Could not get admin token")
            return False
        
        test_files = self.create_test_files()
        uploaded_docs = []
        
        # Test each format
        for format_name, file_info in test_files.items():
            doc_id = self.test_file_format(format_name, file_info)
            if doc_id:
                uploaded_docs.append(doc_id)
        
        # Clean up
        print("\n🧹 Cleaning up uploaded documents...")
        for doc_id in uploaded_docs:
            self.cleanup_document(doc_id)
        
        # Summary
        print("\n" + "=" * 50)
        print("📊 MULTI-FORMAT TEST SUMMARY")
        print("=" * 50)
        print(f"Total tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        return self.tests_passed == self.tests_run

if __name__ == "__main__":
    tester = ReglementMultiFormatTester()
    success = tester.run_multi_format_tests()
    sys.exit(0 if success else 1)