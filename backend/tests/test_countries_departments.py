"""
Test Countries and Departments Management APIs
Tests for dynamic country and department management from Administration module
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCountriesAndDepartmentsAPI:
    """Test suite for Countries and Departments CRUD operations"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@admin.com",
            "password": "Admin123!"
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.auth_token = token
        else:
            # Try alternative admin credentials
            login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
                "email": "admin@example.com",
                "password": "admin123"
            })
            if login_response.status_code == 200:
                token = login_response.json().get("access_token")
                self.session.headers.update({"Authorization": f"Bearer {token}"})
                self.auth_token = token
            else:
                pytest.skip("Could not authenticate as admin")
        
        yield
        
        # Cleanup: Delete test-created data
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Clean up test data after tests"""
        # Delete test countries
        try:
            countries_resp = self.session.get(f"{BASE_URL}/api/countries")
            if countries_resp.status_code == 200:
                countries = countries_resp.json().get("countries", [])
                for country in countries:
                    if country.get("code", "").startswith("TEST"):
                        country_id = country.get("id") or country.get("code")
                        self.session.delete(f"{BASE_URL}/api/countries/{country_id}")
        except:
            pass
        
        # Delete test departments
        try:
            depts_resp = self.session.get(f"{BASE_URL}/api/departments")
            if depts_resp.status_code == 200:
                depts = depts_resp.json().get("departments", [])
                for dept in depts:
                    if dept.get("code", "").startswith("test_"):
                        dept_id = dept.get("id") or dept.get("code")
                        self.session.delete(f"{BASE_URL}/api/departments/{dept_id}")
        except:
            pass

    # ==================== COUNTRIES TESTS ====================
    
    def test_get_countries_list(self):
        """Test GET /api/countries returns list of countries"""
        response = self.session.get(f"{BASE_URL}/api/countries")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "countries" in data, "Response should contain 'countries' key"
        
        countries = data["countries"]
        assert isinstance(countries, list), "Countries should be a list"
        assert len(countries) > 0, "Should have at least one country"
        
        # Verify country structure
        first_country = countries[0]
        assert "code" in first_country, "Country should have 'code' field"
        assert "name" in first_country, "Country should have 'name' field"
        
        print(f"✓ GET /api/countries returned {len(countries)} countries")
    
    def test_create_country(self):
        """Test POST /api/countries creates a new country"""
        new_country = {
            "code": "TESTCOUNTRY1",
            "name": "Test Country One"
        }
        
        response = self.session.post(f"{BASE_URL}/api/countries", json=new_country)
        
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("code") == "TESTCOUNTRY1", "Country code should match"
        assert data.get("name") == "Test Country One", "Country name should match"
        assert "id" in data, "Response should contain 'id'"
        
        print(f"✓ POST /api/countries created country with id: {data.get('id')}")
        
        # Verify country appears in list
        list_response = self.session.get(f"{BASE_URL}/api/countries")
        countries = list_response.json().get("countries", [])
        country_codes = [c.get("code") for c in countries]
        assert "TESTCOUNTRY1" in country_codes, "New country should appear in list"
        
        print("✓ New country appears in GET /api/countries list")
    
    def test_create_duplicate_country_fails(self):
        """Test POST /api/countries with duplicate code fails"""
        # First create a country
        new_country = {
            "code": "TESTDUP",
            "name": "Test Duplicate Country"
        }
        self.session.post(f"{BASE_URL}/api/countries", json=new_country)
        
        # Try to create duplicate
        response = self.session.post(f"{BASE_URL}/api/countries", json=new_country)
        
        assert response.status_code == 400, f"Expected 400 for duplicate, got {response.status_code}"
        print("✓ Duplicate country creation correctly rejected with 400")
    
    def test_delete_country(self):
        """Test DELETE /api/countries/{country_id} removes country"""
        # First create a country
        new_country = {
            "code": "TESTDEL",
            "name": "Test Delete Country"
        }
        create_response = self.session.post(f"{BASE_URL}/api/countries", json=new_country)
        assert create_response.status_code == 201
        
        country_id = create_response.json().get("id")
        
        # Delete the country
        delete_response = self.session.delete(f"{BASE_URL}/api/countries/{country_id}")
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        print(f"✓ DELETE /api/countries/{country_id} succeeded")
        
        # Verify country no longer in list
        list_response = self.session.get(f"{BASE_URL}/api/countries")
        countries = list_response.json().get("countries", [])
        country_codes = [c.get("code") for c in countries]
        assert "TESTDEL" not in country_codes, "Deleted country should not appear in list"
        
        print("✓ Deleted country no longer appears in list")

    # ==================== DEPARTMENTS TESTS ====================
    
    def test_get_departments_list(self):
        """Test GET /api/departments returns list of departments"""
        response = self.session.get(f"{BASE_URL}/api/departments")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "departments" in data, "Response should contain 'departments' key"
        
        departments = data["departments"]
        assert isinstance(departments, list), "Departments should be a list"
        assert len(departments) > 0, "Should have at least one department"
        
        # Verify department structure
        first_dept = departments[0]
        assert "code" in first_dept or "value" in first_dept, "Department should have 'code' or 'value' field"
        assert "name" in first_dept or "label" in first_dept, "Department should have 'name' or 'label' field"
        
        print(f"✓ GET /api/departments returned {len(departments)} departments")
    
    def test_create_department(self):
        """Test POST /api/departments creates a new department"""
        new_dept = {
            "code": "test_dept_1",
            "name": "Test Department One",
            "description": "Test department for testing"
        }
        
        response = self.session.post(f"{BASE_URL}/api/departments", json=new_dept)
        
        assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("code") == "test_dept_1", "Department code should match"
        assert data.get("name") == "Test Department One", "Department name should match"
        assert "id" in data, "Response should contain 'id'"
        
        print(f"✓ POST /api/departments created department with id: {data.get('id')}")
        
        # Verify department appears in list
        list_response = self.session.get(f"{BASE_URL}/api/departments")
        departments = list_response.json().get("departments", [])
        dept_codes = [d.get("code") or d.get("value") for d in departments]
        assert "test_dept_1" in dept_codes, "New department should appear in list"
        
        print("✓ New department appears in GET /api/departments list")
    
    def test_create_duplicate_department_fails(self):
        """Test POST /api/departments with duplicate code fails"""
        # First create a department
        new_dept = {
            "code": "test_dup_dept",
            "name": "Test Duplicate Department"
        }
        self.session.post(f"{BASE_URL}/api/departments", json=new_dept)
        
        # Try to create duplicate
        response = self.session.post(f"{BASE_URL}/api/departments", json=new_dept)
        
        assert response.status_code == 400, f"Expected 400 for duplicate, got {response.status_code}"
        print("✓ Duplicate department creation correctly rejected with 400")
    
    def test_delete_department(self):
        """Test DELETE /api/departments/{dept_id} removes department"""
        # First create a department
        new_dept = {
            "code": "test_del_dept",
            "name": "Test Delete Department"
        }
        create_response = self.session.post(f"{BASE_URL}/api/departments", json=new_dept)
        assert create_response.status_code == 201
        
        dept_id = create_response.json().get("id")
        
        # Delete the department
        delete_response = self.session.delete(f"{BASE_URL}/api/departments/{dept_id}")
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        print(f"✓ DELETE /api/departments/{dept_id} succeeded")
        
        # Verify department no longer in list
        list_response = self.session.get(f"{BASE_URL}/api/departments")
        departments = list_response.json().get("departments", [])
        dept_codes = [d.get("code") or d.get("value") for d in departments]
        assert "test_del_dept" not in dept_codes, "Deleted department should not appear in list"
        
        print("✓ Deleted department no longer appears in list")

    # ==================== INTEGRATION TESTS ====================
    
    def test_countries_used_in_employee_form(self):
        """Test that countries from API can be used in employee creation"""
        # Get countries list
        countries_response = self.session.get(f"{BASE_URL}/api/countries")
        assert countries_response.status_code == 200
        
        countries = countries_response.json().get("countries", [])
        assert len(countries) > 0, "Should have countries available"
        
        # Verify countries have required fields for dropdown
        for country in countries[:5]:  # Check first 5
            assert "code" in country, f"Country missing 'code': {country}"
            assert "name" in country, f"Country missing 'name': {country}"
        
        print(f"✓ Countries API returns {len(countries)} countries with proper structure for dropdown")
    
    def test_departments_used_in_employee_form(self):
        """Test that departments from API can be used in employee creation"""
        # Get departments list
        depts_response = self.session.get(f"{BASE_URL}/api/departments")
        assert depts_response.status_code == 200
        
        departments = depts_response.json().get("departments", [])
        assert len(departments) > 0, "Should have departments available"
        
        # Verify departments have required fields for dropdown
        for dept in departments[:5]:  # Check first 5
            has_code = "code" in dept or "value" in dept
            has_name = "name" in dept or "label" in dept
            assert has_code, f"Department missing 'code'/'value': {dept}"
            assert has_name, f"Department missing 'name'/'label': {dept}"
        
        print(f"✓ Departments API returns {len(departments)} departments with proper structure for dropdown")


class TestAuthenticationRequired:
    """Test that endpoints require authentication"""
    
    def test_countries_requires_auth(self):
        """Test GET /api/countries requires authentication"""
        response = requests.get(f"{BASE_URL}/api/countries")
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ GET /api/countries requires authentication")
    
    def test_departments_requires_auth(self):
        """Test GET /api/departments requires authentication"""
        response = requests.get(f"{BASE_URL}/api/departments")
        # Should return 401 or 403 without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print("✓ GET /api/departments requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
