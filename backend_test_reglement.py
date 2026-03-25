#!/usr/bin/env python3
"""
Test script for Communication module's Reglement API endpoints
Based on review request for PREMIDIS HR Platform
"""

import requests
import sys
import json
import uuid
import io
import os
from datetime import datetime

class ReglementAPITester:
    def __init__(self):
        # Use the backend URL from frontend .env
        self.base_url = "https://6f2abe55-4e3a-4e8c-a63d-8b827fce0381.preview.emergentagent.com"
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.uploaded_document_id = None

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def test_authentication(self):
        """Test login with super admin credentials"""
        print("\n🔐 Testing Authentication...")
        
        # Test super admin login with provided credentials
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
                    self.admin_token = response_data['access_token']
                    self.log_test(
                        "Super Admin Login",
                        True,
                        f"Successfully obtained access token"
                    )
                    return True
                else:
                    self.log_test(
                        "Super Admin Login",
                        False,
                        f"No access_token in response: {response_data}"
                    )
            else:
                try:
                    error_detail = response.json().get('detail', 'Unknown error')
                    self.log_test(
                        "Super Admin Login",
                        False,
                        f"Status: {response.status_code}, Error: {error_detail}"
                    )
                except:
                    self.log_test(
                        "Super Admin Login",
                        False,
                        f"Status: {response.status_code}, Response: {response.text[:200]}"
                    )
        except Exception as e:
            self.log_test(
                "Super Admin Login",
                False,
                f"Exception: {str(e)}"
            )
        
        return False

    def test_get_reglement_documents(self):
        """Test GET /api/communication/reglement - List reglement documents"""
        print("\n📋 Testing GET /api/communication/reglement...")
        
        if not self.admin_token:
            self.log_test("GET reglement documents", False, "No admin token available")
            return
        
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        
        try:
            url = f"{self.base_url}/api/communication/reglement"
            response = requests.get(url, headers=headers)
            
            if response.status_code == 200:
                response_data = response.json()
                if 'documents' in response_data:
                    documents = response_data['documents']
                    self.log_test(
                        "GET reglement documents",
                        True,
                        f"Successfully retrieved {len(documents)} documents"
                    )
                    
                    # Log details of existing documents
                    if documents:
                        print(f"   📄 Found {len(documents)} existing documents:")
                        for doc in documents:
                            print(f"      - {doc.get('name', 'Unknown')} (ID: {doc.get('id', 'N/A')})")
                    
                    return True
                else:
                    self.log_test(
                        "GET reglement documents",
                        False,
                        f"No 'documents' key in response: {response_data}"
                    )
            else:
                try:
                    error_detail = response.json().get('detail', 'Unknown error')
                    self.log_test(
                        "GET reglement documents",
                        False,
                        f"Status: {response.status_code}, Error: {error_detail}"
                    )
                except:
                    self.log_test(
                        "GET reglement documents",
                        False,
                        f"Status: {response.status_code}, Response: {response.text[:200]}"
                    )
        except Exception as e:
            self.log_test(
                "GET reglement documents",
                False,
                f"Exception: {str(e)}"
            )
        
        return False

    def test_delete_existing_documents(self):
        """Delete any existing documents first as requested"""
        print("\n🗑️ Deleting existing documents...")
        
        if not self.admin_token:
            print("   ⚠️ No admin token - skipping deletion")
            return
        
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        
        # First get all documents
        try:
            url = f"{self.base_url}/api/communication/reglement"
            response = requests.get(url, headers=headers)
            
            if response.status_code == 200:
                response_data = response.json()
                documents = response_data.get('documents', [])
                
                if not documents:
                    print("   ℹ️ No existing documents to delete")
                    return
                
                # Delete each document
                for doc in documents:
                    doc_id = doc.get('id')
                    doc_name = doc.get('name', 'Unknown')
                    
                    if doc_id:
                        delete_url = f"{self.base_url}/api/communication/reglement/{doc_id}"
                        delete_response = requests.delete(delete_url, headers=headers)
                        
                        if delete_response.status_code == 200:
                            self.log_test(
                                f"Delete existing document: {doc_name}",
                                True,
                                f"Successfully deleted document ID: {doc_id}"
                            )
                        else:
                            self.log_test(
                                f"Delete existing document: {doc_name}",
                                False,
                                f"Failed to delete - Status: {delete_response.status_code}"
                            )
            else:
                print(f"   ⚠️ Could not retrieve documents for deletion - Status: {response.status_code}")
        
        except Exception as e:
            print(f"   ⚠️ Exception during deletion: {str(e)}")

    def create_test_pdf(self):
        """Create a simple test PDF file"""
        # Simple PDF content
        pdf_content = b"""%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test Reglement Document) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000206 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
300
%%EOF"""
        return pdf_content

    def test_upload_reglement_document(self):
        """Test POST /api/communication/reglement - Upload document"""
        print("\n📤 Testing POST /api/communication/reglement...")
        
        if not self.admin_token:
            self.log_test("Upload reglement document", False, "No admin token available")
            return
        
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        
        # Create test PDF
        pdf_content = self.create_test_pdf()
        
        # Prepare multipart form data
        files = {
            'file': ('test_reglement.pdf', pdf_content, 'application/pdf')
        }
        
        try:
            url = f"{self.base_url}/api/communication/reglement"
            response = requests.post(url, files=files, headers=headers)
            
            if response.status_code == 200:
                response_data = response.json()
                
                # Check required fields in response
                required_fields = ['message', 'document']
                missing_fields = [field for field in required_fields if field not in response_data]
                
                if not missing_fields:
                    document = response_data['document']
                    required_doc_fields = ['id', 'name', 'url', 'file_type', 'content_type']
                    missing_doc_fields = [field for field in required_doc_fields if field not in document]
                    
                    if not missing_doc_fields:
                        self.uploaded_document_id = document['id']
                        self.log_test(
                            "Upload reglement document",
                            True,
                            f"Successfully uploaded: {document.get('name')} (ID: {document.get('id')})"
                        )
                        
                        # Verify document fields
                        print(f"   📄 Document details:")
                        print(f"      - ID: {document.get('id')}")
                        print(f"      - Name: {document.get('name')}")
                        print(f"      - URL: {document.get('url')}")
                        print(f"      - File Type: {document.get('file_type')}")
                        print(f"      - Content Type: {document.get('content_type')}")
                        
                        return True
                    else:
                        self.log_test(
                            "Upload reglement document",
                            False,
                            f"Missing document fields: {missing_doc_fields}"
                        )
                else:
                    self.log_test(
                        "Upload reglement document",
                        False,
                        f"Missing response fields: {missing_fields}"
                    )
            else:
                try:
                    error_detail = response.json().get('detail', 'Unknown error')
                    self.log_test(
                        "Upload reglement document",
                        False,
                        f"Status: {response.status_code}, Error: {error_detail}"
                    )
                except:
                    self.log_test(
                        "Upload reglement document",
                        False,
                        f"Status: {response.status_code}, Response: {response.text[:200]}"
                    )
        except Exception as e:
            self.log_test(
                "Upload reglement document",
                False,
                f"Exception: {str(e)}"
            )
        
        return False

    def test_verify_file_serving(self):
        """Test file serving: GET /api/uploads/{filename}"""
        print("\n🌐 Testing file serving...")
        
        if not self.uploaded_document_id:
            self.log_test("Verify file serving", False, "No uploaded document to test")
            return
        
        # First get the document details to get the URL
        if not self.admin_token:
            self.log_test("Verify file serving", False, "No admin token available")
            return
        
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        
        try:
            # Get document list to find our uploaded document
            url = f"{self.base_url}/api/communication/reglement"
            response = requests.get(url, headers=headers)
            
            if response.status_code == 200:
                response_data = response.json()
                documents = response_data.get('documents', [])
                
                # Find our uploaded document
                uploaded_doc = None
                for doc in documents:
                    if doc.get('id') == self.uploaded_document_id:
                        uploaded_doc = doc
                        break
                
                if uploaded_doc:
                    file_url = uploaded_doc.get('url')
                    if file_url:
                        # Test file access
                        full_url = f"{self.base_url}{file_url}"
                        file_response = requests.get(full_url)
                        
                        if file_response.status_code == 200:
                            # Check content type
                            content_type = file_response.headers.get('content-type', '')
                            content_length = len(file_response.content)
                            
                            self.log_test(
                                "Verify file serving",
                                True,
                                f"File accessible at {file_url}, Content-Type: {content_type}, Size: {content_length} bytes"
                            )
                            return True
                        else:
                            self.log_test(
                                "Verify file serving",
                                False,
                                f"File not accessible - Status: {file_response.status_code}"
                            )
                    else:
                        self.log_test(
                            "Verify file serving",
                            False,
                            "No URL found in document"
                        )
                else:
                    self.log_test(
                        "Verify file serving",
                        False,
                        f"Uploaded document with ID {self.uploaded_document_id} not found"
                    )
            else:
                self.log_test(
                    "Verify file serving",
                    False,
                    f"Could not retrieve documents - Status: {response.status_code}"
                )
        except Exception as e:
            self.log_test(
                "Verify file serving",
                False,
                f"Exception: {str(e)}"
            )
        
        return False

    def test_delete_reglement_document(self):
        """Test DELETE /api/communication/reglement/{id} - Delete document"""
        print("\n🗑️ Testing DELETE /api/communication/reglement/{id}...")
        
        if not self.admin_token:
            self.log_test("Delete reglement document", False, "No admin token available")
            return
        
        if not self.uploaded_document_id:
            self.log_test("Delete reglement document", False, "No uploaded document to delete")
            return
        
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        
        try:
            url = f"{self.base_url}/api/communication/reglement/{self.uploaded_document_id}"
            response = requests.delete(url, headers=headers)
            
            if response.status_code == 200:
                response_data = response.json()
                expected_message = "Document supprimé avec succès"
                
                if response_data.get('message') == expected_message:
                    self.log_test(
                        "Delete reglement document",
                        True,
                        f"Successfully deleted document ID: {self.uploaded_document_id}"
                    )
                    return True
                else:
                    self.log_test(
                        "Delete reglement document",
                        False,
                        f"Unexpected message: {response_data.get('message')}"
                    )
            else:
                try:
                    error_detail = response.json().get('detail', 'Unknown error')
                    self.log_test(
                        "Delete reglement document",
                        False,
                        f"Status: {response.status_code}, Error: {error_detail}"
                    )
                except:
                    self.log_test(
                        "Delete reglement document",
                        False,
                        f"Status: {response.status_code}, Response: {response.text[:200]}"
                    )
        except Exception as e:
            self.log_test(
                "Delete reglement document",
                False,
                f"Exception: {str(e)}"
            )
        
        return False

    def test_verify_document_deleted(self):
        """Verify the document no longer exists after deletion"""
        print("\n🔍 Verifying document deletion...")
        
        if not self.admin_token:
            self.log_test("Verify document deleted", False, "No admin token available")
            return
        
        if not self.uploaded_document_id:
            self.log_test("Verify document deleted", False, "No document ID to verify")
            return
        
        headers = {'Authorization': f'Bearer {self.admin_token}'}
        
        try:
            url = f"{self.base_url}/api/communication/reglement"
            response = requests.get(url, headers=headers)
            
            if response.status_code == 200:
                response_data = response.json()
                documents = response_data.get('documents', [])
                
                # Check if our document still exists
                document_exists = any(doc.get('id') == self.uploaded_document_id for doc in documents)
                
                if not document_exists:
                    self.log_test(
                        "Verify document deleted",
                        True,
                        f"Document ID {self.uploaded_document_id} successfully removed from list"
                    )
                    return True
                else:
                    self.log_test(
                        "Verify document deleted",
                        False,
                        f"Document ID {self.uploaded_document_id} still exists in list"
                    )
            else:
                self.log_test(
                    "Verify document deleted",
                    False,
                    f"Could not retrieve documents - Status: {response.status_code}"
                )
        except Exception as e:
            self.log_test(
                "Verify document deleted",
                False,
                f"Exception: {str(e)}"
            )
        
        return False

    def run_all_tests(self):
        """Run all reglement API tests"""
        print("🚀 Starting Communication Module - Reglement API Tests")
        print(f"📍 Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Test sequence as requested in review
        if self.test_authentication():
            self.test_delete_existing_documents()  # Delete existing documents first
            self.test_get_reglement_documents()    # List documents (should be empty now)
            
            if self.test_upload_reglement_document():  # Upload new document
                self.test_verify_file_serving()       # Verify file is accessible
                self.test_delete_reglement_document()  # Delete the document
                self.test_verify_document_deleted()   # Verify deletion
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        print(f"Total tests run: {self.tests_run}")
        print(f"Tests passed: {self.tests_passed}")
        print(f"Tests failed: {self.tests_run - self.tests_passed}")
        print(f"Success rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        if self.tests_passed == self.tests_run:
            print("\n🎉 ALL TESTS PASSED! Communication Reglement API is working correctly.")
        else:
            print(f"\n⚠️ {self.tests_run - self.tests_passed} test(s) failed. See details above.")
            
            # Show failed tests
            failed_tests = [test for test in self.test_results if not test['success']]
            if failed_tests:
                print("\n❌ Failed Tests:")
                for test in failed_tests:
                    print(f"   - {test['test']}: {test['details']}")
        
        return self.tests_passed == self.tests_run

if __name__ == "__main__":
    tester = ReglementAPITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)