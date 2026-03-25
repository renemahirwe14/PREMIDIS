#!/usr/bin/env python3
"""
Document Editor API Testing Script
Tests the Document Editor API endpoints as requested in the review.
"""

import requests
import json
import uuid
import base64
from datetime import datetime
import io

class DocumentEditorTester:
    def __init__(self):
        # Use the backend URL from frontend/.env
        self.base_url = "https://6f2abe55-4e3a-4e8c-a63d-8b827fce0381.preview.emergentagent.com"
        self.token = None
        self.document_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

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

    def create_test_pdf(self):
        """Create a minimal test PDF"""
        # Create a minimal valid PDF content
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
(Test Document) Tj
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

    def authenticate(self):
        """Authenticate with the provided credentials"""
        print("\n🔐 Authenticating...")
        
        login_data = {
            "email": "superadmin@premierdis.com",
            "password": "SuperAdmin123!"
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/api/auth/login",
                json=login_data,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get('access_token')
                self.log_test("Authentication", True, f"Logged in as {data.get('user', {}).get('email')}")
                return True
            else:
                self.log_test("Authentication", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Authentication", False, f"Exception: {str(e)}")
            return False

    def test_upload_file(self):
        """Test POST /api/documents/upload-file"""
        print("\n📤 Testing Document Upload...")
        
        if not self.token:
            self.log_test("Upload File", False, "No authentication token")
            return False
        
        # Create test PDF
        pdf_content = self.create_test_pdf()
        
        files = {
            'file': ('test_document.pdf', pdf_content, 'application/pdf')
        }
        
        headers = {
            'Authorization': f'Bearer {self.token}'
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/api/documents/upload-file",
                files=files,
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                document = data.get('document', {})
                self.document_id = document.get('id')
                
                # Verify response structure
                has_id = bool(self.document_id)
                has_pages = 'pages' in document and len(document['pages']) > 0
                has_page_count = document.get('page_count', 0) > 0
                has_file_type = document.get('file_type') == 'pdf'
                
                # Check if pages have image_url
                pages_have_images = all(
                    'image_url' in page for page in document.get('pages', [])
                )
                
                self.log_test("Upload File - Success", True, f"Document ID: {self.document_id}")
                self.log_test("Upload File - Has ID", has_id, f"ID: {self.document_id}")
                self.log_test("Upload File - Has Pages", has_pages, f"Pages: {len(document.get('pages', []))}")
                self.log_test("Upload File - Has Page Count", has_page_count, f"Page count: {document.get('page_count')}")
                self.log_test("Upload File - Correct File Type", has_file_type, f"File type: {document.get('file_type')}")
                self.log_test("Upload File - Pages Have Images", pages_have_images, "All pages have image_url")
                
                return True
            else:
                self.log_test("Upload File", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Upload File", False, f"Exception: {str(e)}")
            return False

    def test_list_documents(self):
        """Test GET /api/documents/editor-docs"""
        print("\n📋 Testing List Documents...")
        
        if not self.token:
            self.log_test("List Documents", False, "No authentication token")
            return False
        
        headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.get(
                f"{self.base_url}/api/documents/editor-docs",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                documents = data.get('documents', [])
                
                has_documents = len(documents) > 0
                document_found = any(doc.get('id') == self.document_id for doc in documents) if self.document_id else False
                
                self.log_test("List Documents - Success", True, f"Found {len(documents)} documents")
                self.log_test("List Documents - Has Documents", has_documents, f"Document count: {len(documents)}")
                
                if self.document_id:
                    self.log_test("List Documents - Uploaded Document Found", document_found, f"Document {self.document_id} in list")
                
                return True
            elif response.status_code == 404:
                # KNOWN BUG: Route ordering issue - /editor-docs is being caught by /{document_id} route
                # The generic /{document_id} route is defined before /editor-docs, causing FastAPI to 
                # treat "editor-docs" as a document_id parameter instead of matching the specific route
                self.log_test("List Documents - KNOWN BUG", False, "Route ordering issue: /editor-docs caught by /{document_id} route. Needs fix in server.py")
                return False
            else:
                self.log_test("List Documents", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("List Documents", False, f"Exception: {str(e)}")
            return False

    def test_get_document(self):
        """Test GET /api/documents/editor-docs/{id}"""
        print("\n📄 Testing Get Specific Document...")
        
        if not self.token or not self.document_id:
            self.log_test("Get Document", False, "No authentication token or document ID")
            return False
        
        headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.get(
                f"{self.base_url}/api/documents/editor-docs/{self.document_id}",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                
                has_overlay_elements = 'overlay_elements' in data
                has_pages = 'pages' in data and len(data['pages']) > 0
                has_metadata = all(key in data for key in ['id', 'name', 'file_type'])
                
                self.log_test("Get Document - Success", True, f"Retrieved document {self.document_id}")
                self.log_test("Get Document - Has Overlay Elements", has_overlay_elements, f"overlay_elements present: {has_overlay_elements}")
                self.log_test("Get Document - Has Pages", has_pages, f"Pages count: {len(data.get('pages', []))}")
                self.log_test("Get Document - Has Metadata", has_metadata, "Required metadata fields present")
                
                return True
            else:
                self.log_test("Get Document", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Document", False, f"Exception: {str(e)}")
            return False

    def test_save_overlay(self):
        """Test PUT /api/documents/editor-docs/{id}/overlay"""
        print("\n🎨 Testing Save Overlay Elements...")
        
        if not self.token or not self.document_id:
            self.log_test("Save Overlay", False, "No authentication token or document ID")
            return False
        
        # Create test overlay elements
        overlay_data = {
            "elements": [
                {
                    "id": "test1",
                    "type": "text",
                    "x": 100,
                    "y": 200,
                    "page": 1,
                    "content": "Hello World",
                    "fontSize": 16,
                    "color": "#000000"
                },
                {
                    "id": "test2",
                    "type": "text",
                    "x": 150,
                    "y": 250,
                    "page": 1,
                    "content": "Test Overlay",
                    "fontSize": 14,
                    "color": "#FF0000"
                }
            ]
        }
        
        headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.put(
                f"{self.base_url}/api/documents/editor-docs/{self.document_id}/overlay",
                json=overlay_data,
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                message = data.get('message', '')
                
                success_message = 'sauvegardé' in message.lower() or 'saved' in message.lower()
                
                self.log_test("Save Overlay - Success", True, f"Message: {message}")
                self.log_test("Save Overlay - Correct Message", success_message, f"Response message: {message}")
                
                return True
            else:
                self.log_test("Save Overlay", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Save Overlay", False, f"Exception: {str(e)}")
            return False

    def test_get_history(self):
        """Test GET /api/documents/editor-docs/{id}/history"""
        print("\n📚 Testing Get Version History...")
        
        if not self.token or not self.document_id:
            self.log_test("Get History", False, "No authentication token or document ID")
            return False
        
        headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.get(
                f"{self.base_url}/api/documents/editor-docs/{self.document_id}/history",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                history = data.get('history', [])
                
                has_history = len(history) > 0
                has_document_name = 'document_name' in data
                
                # Check if history entries have required fields
                valid_history_entries = all(
                    all(key in entry for key in ['id', 'saved_by', 'saved_at'])
                    for entry in history
                ) if history else True
                
                self.log_test("Get History - Success", True, f"Retrieved {len(history)} history entries")
                self.log_test("Get History - Has History", has_history, f"History entries: {len(history)}")
                self.log_test("Get History - Has Document Name", has_document_name, f"Document name present: {has_document_name}")
                self.log_test("Get History - Valid Entries", valid_history_entries, "All history entries have required fields")
                
                return True
            else:
                self.log_test("Get History", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get History", False, f"Exception: {str(e)}")
            return False

    def test_generate_pdf(self):
        """Test POST /api/documents/editor-docs/{id}/generate-pdf"""
        print("\n📄 Testing Generate PDF...")
        
        if not self.token or not self.document_id:
            self.log_test("Generate PDF", False, "No authentication token or document ID")
            return False
        
        # Create overlay elements for PDF generation
        pdf_data = {
            "elements": [
                {
                    "type": "text",
                    "x": 100,
                    "y": 200,
                    "page": 1,
                    "content": "Test overlay text",
                    "fontSize": 16,
                    "color": "#000000"
                },
                {
                    "type": "text",
                    "x": 100,
                    "y": 250,
                    "page": 1,
                    "content": "Generated PDF Test",
                    "fontSize": 14,
                    "color": "#0000FF"
                }
            ]
        }
        
        headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/api/documents/editor-docs/{self.document_id}/generate-pdf",
                json=pdf_data,
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                pdf_url = data.get('pdf_url', '')
                filename = data.get('filename', '')
                
                has_pdf_url = bool(pdf_url)
                has_filename = bool(filename)
                
                self.log_test("Generate PDF - Success", True, f"PDF URL: {pdf_url}")
                self.log_test("Generate PDF - Has URL", has_pdf_url, f"PDF URL: {pdf_url}")
                self.log_test("Generate PDF - Has Filename", has_filename, f"Filename: {filename}")
                
                # Test if the generated PDF is accessible
                if pdf_url:
                    self.test_pdf_accessibility(pdf_url)
                
                return True
            else:
                self.log_test("Generate PDF", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Generate PDF", False, f"Exception: {str(e)}")
            return False

    def test_pdf_accessibility(self, pdf_url):
        """Test if the generated PDF is accessible"""
        print("\n🔍 Testing PDF Accessibility...")
        
        # Construct full URL if relative
        if pdf_url.startswith('/'):
            full_url = f"{self.base_url}{pdf_url}"
        else:
            full_url = pdf_url
        
        try:
            response = requests.get(full_url)
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                content_length = len(response.content)
                
                is_pdf = 'application/pdf' in content_type
                has_content = content_length > 0
                
                self.log_test("PDF Accessibility - Success", True, f"PDF accessible at {full_url}")
                self.log_test("PDF Accessibility - Correct Type", is_pdf, f"Content-Type: {content_type}")
                self.log_test("PDF Accessibility - Has Content", has_content, f"Content length: {content_length} bytes")
                
                return True
            else:
                self.log_test("PDF Accessibility", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("PDF Accessibility", False, f"Exception: {str(e)}")
            return False

    def test_delete_document(self):
        """Test DELETE /api/documents/editor-docs/{id}"""
        print("\n🗑️ Testing Delete Document...")
        
        if not self.token or not self.document_id:
            self.log_test("Delete Document", False, "No authentication token or document ID")
            return False
        
        headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.delete(
                f"{self.base_url}/api/documents/editor-docs/{self.document_id}",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                message = data.get('message', '')
                
                success_message = 'supprimé' in message.lower() or 'deleted' in message.lower()
                
                self.log_test("Delete Document - Success", True, f"Message: {message}")
                self.log_test("Delete Document - Correct Message", success_message, f"Response message: {message}")
                
                # Verify document is actually deleted by trying to get it
                self.verify_document_deleted()
                
                return True
            else:
                self.log_test("Delete Document", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Delete Document", False, f"Exception: {str(e)}")
            return False

    def verify_document_deleted(self):
        """Verify that the document was actually deleted"""
        print("\n✅ Verifying Document Deletion...")
        
        headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.get(
                f"{self.base_url}/api/documents/editor-docs/{self.document_id}",
                headers=headers
            )
            
            if response.status_code == 404:
                self.log_test("Verify Deletion - Document Not Found", True, "Document properly deleted (404)")
                return True
            else:
                self.log_test("Verify Deletion - Document Still Exists", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Verify Deletion", False, f"Exception: {str(e)}")
            return False

    def run_full_lifecycle_test(self):
        """Run the complete Document Editor API lifecycle test"""
        print("🚀 Starting Document Editor API Lifecycle Test")
        print("=" * 60)
        
        # Step 1: Authenticate
        if not self.authenticate():
            print("❌ Authentication failed. Cannot proceed with tests.")
            return False
        
        # Step 2: Upload document
        if not self.test_upload_file():
            print("❌ Document upload failed. Cannot proceed with tests.")
            return False
        
        # Step 3: List documents
        self.test_list_documents()
        
        # Step 4: Get specific document
        self.test_get_document()
        
        # Step 5: Save overlay elements
        self.test_save_overlay()
        
        # Step 6: Get version history
        self.test_get_history()
        
        # Step 7: Generate PDF with overlay
        self.test_generate_pdf()
        
        # Step 8: Delete document
        self.test_delete_document()
        
        # Print summary
        self.print_summary()
        
        return self.tests_passed == self.tests_run

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        if self.tests_run - self.tests_passed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  - {result['test']}: {result['details']}")
        
        print("\n✅ PASSED TESTS:")
        for result in self.test_results:
            if result['success']:
                print(f"  - {result['test']}")

if __name__ == "__main__":
    tester = DocumentEditorTester()
    success = tester.run_full_lifecycle_test()
    
    if success:
        print("\n🎉 All Document Editor API tests passed!")
        exit(0)
    else:
        print("\n💥 Some Document Editor API tests failed!")
        exit(1)