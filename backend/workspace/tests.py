from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
import json
import uuid

from workspace.models import Workspace, WorkspaceMembership
from django.core.management import call_command

class WorkspaceTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        # Create users
        self.user_a = User.objects.create_user(username="user_a", first_name="User A")
        self.user_b = User.objects.create_user(username="user_b", first_name="User B")
        self.user_c = User.objects.create_user(username="user_c", first_name="User C")

        # Create workspaces for user_a
        self.workspace_a1 = Workspace.objects.create(name="Workspace A1", owner=self.user_a)

    # --- AUTHENTICATION ---
    def test_unauthenticated_workspace_list(self):
        response = self.client.get(reverse('workspace-list'))
        self.assertEqual(response.status_code, 401)

    def test_unauthenticated_workspace_creation(self):
        response = self.client.post(reverse('workspace-list'), {'name': 'New Workspace'})
        self.assertEqual(response.status_code, 401)

    # --- OWNERSHIP ---
    def test_user_can_create_workspace(self):
        self.client.force_login(self.user_a)
        response = self.client.post(reverse('workspace-list'), {'name': 'Workspace A2'})
        self.assertEqual(response.status_code, 201)
        data = json.loads(response.content)
        self.assertEqual(data['name'], 'Workspace A2')
        self.assertEqual(data['owner']['username'], 'user_a')

    def test_workspace_owner_is_always_request_user(self):
        self.client.force_login(self.user_a)
        response = self.client.post(reverse('workspace-list'), {'name': 'Workspace A3'})
        data = json.loads(response.content)
        workspace = Workspace.objects.get(id=data['id'])
        self.assertEqual(workspace.owner, self.user_a)

    def test_client_cannot_impersonate_another_owner(self):
        self.client.force_login(self.user_a)
        # Attempt to create workspace owned by user_b
        response = self.client.post(reverse('workspace-list'), {
            'name': 'Workspace Fake',
            'owner': {'id': self.user_b.id, 'username': 'user_b'}
        })
        self.assertEqual(response.status_code, 201)
        data = json.loads(response.content)
        # Verify the owner is still user_a, and user_b impersonation was ignored
        self.assertEqual(data['owner']['username'], 'user_a')

    def test_user_can_update_own_workspace(self):
        self.client.force_login(self.user_a)
        response = self.client.patch(
            reverse('workspace-detail', kwargs={'pk': self.workspace_a1.id}),
            {'name': 'Workspace A1 Renamed'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.workspace_a1.refresh_from_db()
        self.assertEqual(self.workspace_a1.name, 'Workspace A1 Renamed')

    def test_unrelated_user_cannot_update_workspace(self):
        self.client.force_login(self.user_b)
        response = self.client.patch(
            reverse('workspace-detail', kwargs={'pk': self.workspace_a1.id}),
            {'name': 'Hacked Workspace'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)

    def test_member_cannot_update_workspace(self):
        # Make user_b a member
        WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_b, role='MEMBER')
        self.client.force_login(self.user_b)
        response = self.client.patch(
            reverse('workspace-detail', kwargs={'pk': self.workspace_a1.id}),
            {'name': 'Hacked Workspace'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)

    # --- MEMBERSHIP & ACCESS CONTROL ---
    def test_owner_can_list_members(self):
        WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_b, role='MEMBER')
        self.client.force_login(self.user_a)
        response = self.client.get(reverse('workspace-members', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['user']['username'], 'user_b')
        self.assertEqual(data[0]['role'], 'MEMBER')

    def test_member_can_list_members(self):
        WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_b, role='MEMBER')
        WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_c, role='VIEWER')
        self.client.force_login(self.user_b)
        response = self.client.get(reverse('workspace-members', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(len(data), 2)

    def test_unrelated_user_cannot_list_members(self):
        WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_b, role='MEMBER')
        self.client.force_login(self.user_c)
        response = self.client.get(reverse('workspace-members', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 403)

    def test_owner_can_add_member(self):
        self.client.force_login(self.user_a)
        response = self.client.post(
            reverse('workspace-members', kwargs={'pk': self.workspace_a1.id}),
            {'user_id': self.user_b.id}
        )
        self.assertEqual(response.status_code, 201)
        data = json.loads(response.content)
        self.assertEqual(data['role'], 'MEMBER')
        self.assertTrue(WorkspaceMembership.objects.filter(workspace=self.workspace_a1, user=self.user_b, role='MEMBER').exists())

    def test_owner_can_add_member_with_custom_role(self):
        self.client.force_login(self.user_a)
        response = self.client.post(
            reverse('workspace-members', kwargs={'pk': self.workspace_a1.id}),
            {'user_id': self.user_b.id, 'role': 'ADMIN'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        data = json.loads(response.content)
        self.assertEqual(data['role'], 'ADMIN')
        self.assertTrue(WorkspaceMembership.objects.filter(workspace=self.workspace_a1, user=self.user_b, role='ADMIN').exists())

    def test_owner_can_update_member_role(self):
        membership = WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_b, role='MEMBER')
        self.client.force_login(self.user_a)
        response = self.client.patch(
            reverse('workspace-member-detail', kwargs={'pk': self.workspace_a1.id, 'user_id': self.user_b.id}),
            {'role': 'VIEWER'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        membership.refresh_from_db()
        self.assertEqual(membership.role, 'VIEWER')

    def test_member_cannot_update_member_role(self):
        WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_b, role='MEMBER')
        WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_c, role='MEMBER')
        self.client.force_login(self.user_b)
        response = self.client.patch(
            reverse('workspace-member-detail', kwargs={'pk': self.workspace_a1.id, 'user_id': self.user_c.id}),
            {'role': 'ADMIN'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)

    def test_unrelated_user_cannot_update_member_role(self):
        WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_b, role='MEMBER')
        self.client.force_login(self.user_c)
        response = self.client.patch(
            reverse('workspace-member-detail', kwargs={'pk': self.workspace_a1.id, 'user_id': self.user_b.id}),
            {'role': 'ADMIN'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)

    def test_owner_cannot_modify_own_role(self):
        self.client.force_login(self.user_a)
        response = self.client.patch(
            reverse('workspace-member-detail', kwargs={'pk': self.workspace_a1.id, 'user_id': self.user_a.id}),
            {'role': 'VIEWER'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.content)
        self.assertIn("Cannot modify the role of the workspace owner", data['error'])

    def test_owner_cannot_remove_self(self):
        self.client.force_login(self.user_a)
        response = self.client.delete(
            reverse('workspace-member-detail', kwargs={'pk': self.workspace_a1.id, 'user_id': self.user_a.id})
        )
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.content)
        self.assertIn("Cannot remove the workspace owner", data['error'])

    def test_owner_can_remove_member(self):
        membership = WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_b, role='MEMBER')
        self.client.force_login(self.user_a)
        response = self.client.delete(
            reverse('workspace-member-detail', kwargs={'pk': self.workspace_a1.id, 'user_id': self.user_b.id})
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(WorkspaceMembership.objects.filter(workspace=self.workspace_a1, user=self.user_b).exists())

    def test_member_cannot_manage_membership(self):
        WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_b, role='MEMBER')
        self.client.force_login(self.user_b)
        # Try to add user_c
        response = self.client.post(
            reverse('workspace-members', kwargs={'pk': self.workspace_a1.id}),
            {'user_id': self.user_c.id}
        )
        self.assertEqual(response.status_code, 403)
        # Try to remove user_c
        response = self.client.delete(
            reverse('workspace-member-detail', kwargs={'pk': self.workspace_a1.id, 'user_id': self.user_c.id})
        )
        self.assertEqual(response.status_code, 403)

    def test_duplicate_membership_prevented(self):
        WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_b, role='MEMBER')
        self.client.force_login(self.user_a)
        response = self.client.post(
            reverse('workspace-members', kwargs={'pk': self.workspace_a1.id}),
            {'user_id': self.user_b.id}
        )
        self.assertEqual(response.status_code, 400)

    def test_owner_cannot_be_added_as_member(self):
        self.client.force_login(self.user_a)
        response = self.client.post(
            reverse('workspace-members', kwargs={'pk': self.workspace_a1.id}),
            {'user_id': self.user_a.id}
        )
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.content)
        self.assertIn("owner cannot be added as a member", data['error'])

    def test_invalid_role_rejected(self):
        self.client.force_login(self.user_a)
        response = self.client.post(
            reverse('workspace-members', kwargs={'pk': self.workspace_a1.id}),
            {'user_id': self.user_b.id, 'role': 'SUPERUSER'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)

    def test_user_can_belong_to_unlimited_workspaces(self):
        # Create many workspaces owned by user_b
        workspaces = [Workspace.objects.create(name=f"Workspace B{i}", owner=self.user_b) for i in range(10)]
        for ws in workspaces:
            WorkspaceMembership.objects.create(workspace=ws, user=self.user_a, role='MEMBER')
        # user_a is now a member of 10 workspaces. This is valid.
        self.assertEqual(WorkspaceMembership.objects.filter(user=self.user_a).count(), 10)

    # --- ACCESS ---
    def test_owner_can_retrieve(self):
        self.client.force_login(self.user_a)
        response = self.client.get(reverse('workspace-detail', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 200)

    def test_member_can_retrieve(self):
        WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_b, role='MEMBER')
        self.client.force_login(self.user_b)
        response = self.client.get(reverse('workspace-detail', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 200)

    def test_unrelated_user_gets_403(self):
        self.client.force_login(self.user_b)
        response = self.client.get(reverse('workspace-detail', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 403)

    def test_nonexistent_workspace_gets_404(self):
        self.client.force_login(self.user_a)
        fake_uuid = uuid.uuid4()
        response = self.client.get(reverse('workspace-detail', kwargs={'pk': fake_uuid}))
        self.assertEqual(response.status_code, 404)

    # --- WORKSPACE LIMIT ---
    def test_workspace_limit_enforced(self):
        self.client.force_login(self.user_a)
        # Create 4 more workspaces for user_a (total 5)
        for i in range(4):
            Workspace.objects.create(name=f"Workspace A-Limit {i}", owner=self.user_a)
        
        # Sixth owned workspace creation should be rejected
        response = self.client.post(reverse('workspace-list'), {'name': 'Workspace A6'})
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.content)
        self.assertIn("maximum limit of 5 owned workspaces", data['error'])

    def test_membership_does_not_count_toward_owned_limit(self):
        self.client.force_login(self.user_a)
        # user_a owns 1 workspace. Let's make user_a a member of 10 workspaces owned by user_b
        for i in range(10):
            ws = Workspace.objects.create(name=f"Workspace B-Limit {i}", owner=self.user_b)
            WorkspaceMembership.objects.create(workspace=ws, user=self.user_a, role='MEMBER')
        # user_a can still create up to 4 more owned workspaces
        for i in range(4):
            response = self.client.post(reverse('workspace-list'), {'name': f"Workspace A-New {i}"})
            self.assertEqual(response.status_code, 201)

    # --- DEFAULT WORKSPACE ---
    def test_new_user_registration_creates_exactly_one_default_workspace(self):
        self.client.force_login(self.user_c)
        # Verify user_c has no workspaces initially
        self.assertEqual(Workspace.objects.filter(owner=self.user_c).count(), 0)
        
    # --- ARCHIVAL ---
    def test_owner_can_archive(self):
        self.client.force_login(self.user_a)
        response = self.client.post(reverse('workspace-archive', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 200)
        self.workspace_a1.refresh_from_db()
        self.assertTrue(self.workspace_a1.is_archived)
        self.assertIsNotNone(self.workspace_a1.archived_at)
        self.assertIsNotNone(self.workspace_a1.scheduled_deletion_at)

    def test_member_cannot_archive(self):
        WorkspaceMembership.objects.create(workspace=self.workspace_a1, user=self.user_b, role='MEMBER')
        self.client.force_login(self.user_b)
        response = self.client.post(reverse('workspace-archive', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 403)

    def test_archived_workspace_disappears_from_normal_active_list(self):
        self.client.force_login(self.user_a)
        response = self.client.get(reverse('workspace-list'))
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(len(data), 1) # workspace_a1 is active

        # Archive it
        self.workspace_a1.is_archived = True
        self.workspace_a1.save()

        response2 = self.client.get(reverse('workspace-list'))
        data2 = json.loads(response2.content)
        self.assertEqual(len(data2), 0) # Excluded

    def test_archived_workspace_cannot_be_normally_accessed(self):
        self.workspace_a1.is_archived = True
        self.workspace_a1.save()

        self.client.force_login(self.user_a)
        response = self.client.get(reverse('workspace-detail', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 403)

    def test_owner_can_restore_before_deadline(self):
        self.workspace_a1.is_archived = True
        self.workspace_a1.archived_at = timezone.now()
        self.workspace_a1.scheduled_deletion_at = timezone.now() + timedelta(days=30)
        self.workspace_a1.save()

        self.client.force_login(self.user_a)
        response = self.client.post(reverse('workspace-restore', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 200)
        self.workspace_a1.refresh_from_db()
        self.assertFalse(self.workspace_a1.is_archived)
        self.assertIsNone(self.workspace_a1.archived_at)
        self.assertIsNone(self.workspace_a1.scheduled_deletion_at)

    def test_archived_workspace_remains_counted_toward_limit(self):
        self.workspace_a1.is_archived = True
        self.workspace_a1.save()

        self.client.force_login(self.user_a)
        # Create 4 more (total 5 owned, including the archived one)
        for i in range(4):
            Workspace.objects.create(name=f"Workspace A-Limit {i}", owner=self.user_a)

        # Sixth creation should be blocked
        response = self.client.post(reverse('workspace-list'), {'name': 'Workspace A6'})
        self.assertEqual(response.status_code, 400)

    def test_purge_management_command(self):
        # 1. Create a workspace with a scheduled deletion date in the past
        past_deletion = timezone.now() - timedelta(days=1)
        ws_old = Workspace.objects.create(
            name="Workspace Old",
            owner=self.user_a,
            is_archived=True,
            scheduled_deletion_at=past_deletion
        )
        # 2. Create an archived workspace with deletion date in the future
        future_deletion = timezone.now() + timedelta(days=29)
        ws_new = Workspace.objects.create(
            name="Workspace Future",
            owner=self.user_a,
            is_archived=True,
            scheduled_deletion_at=future_deletion
        )
        
        # Run command
        call_command('purge_archived_workspaces')

        # Verify old is purged, future is not, and active workspace_a1 is not
        self.assertFalse(Workspace.objects.filter(id=ws_old.id).exists())
        self.assertTrue(Workspace.objects.filter(id=ws_new.id).exists())
        self.assertTrue(Workspace.objects.filter(id=self.workspace_a1.id).exists())

    # --- AI WORKSPACE CONFIGURATION & REGISTRY ---
    def test_get_ai_providers_registry(self):
        # Unauthenticated request fails
        response = self.client.get(reverse('workspace-ai-providers'))
        self.assertEqual(response.status_code, 401)

        # Authenticated request succeeds and returns providers registry structure
        self.client.force_login(self.user_a)
        response = self.client.get(reverse('workspace-ai-providers'))
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertIn("simulated", data)
        self.assertIn("gemini", data)
        self.assertEqual(data["gemini"]["display_name"], "Google AI Studio / Gemini")
        self.assertIn("gemini-2.5-flash", data["gemini"]["models"])

    def test_get_workspace_settings(self):
        # 1. Unauthenticated gets 401
        response = self.client.get(reverse('workspace-settings', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 401)

        # 2. Unrelated user gets 403
        self.client.force_login(self.user_b)
        response = self.client.get(reverse('workspace-settings', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 403)

        # 3. Owner gets 200 and defaults
        self.client.force_login(self.user_a)
        response = self.client.get(reverse('workspace-settings', kwargs={'pk': self.workspace_a1.id}))
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data["ai_provider"], "simulated")
        self.assertEqual(data["ai_model"], "dev-mock")

    def test_update_workspace_settings_validation(self):
        self.client.force_login(self.user_a)
        
        # 1. Update with valid parameters
        response = self.client.patch(
            reverse('workspace-settings', kwargs={'pk': self.workspace_a1.id}),
            {'ai_provider': 'gemini', 'ai_model': 'gemini-2.5-pro'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data["ai_provider"], "gemini")
        self.assertEqual(data["ai_model"], "gemini-2.5-pro")

        # Refresh model
        self.workspace_a1.refresh_from_db()
        self.assertEqual(self.workspace_a1.ai_provider, "gemini")
        self.assertEqual(self.workspace_a1.ai_model, "gemini-2.5-pro")

        # 2. Update with invalid provider fails validation
        response = self.client.patch(
            reverse('workspace-settings', kwargs={'pk': self.workspace_a1.id}),
            {'ai_provider': 'unsupported_provider'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)

    def test_workspace_settings_isolation(self):
        # Create second workspace for user_a
        workspace_a2 = Workspace.objects.create(name="Workspace A2", owner=self.user_a)
        
        self.client.force_login(self.user_a)
        
        # Configure Workspace A1 as Gemini
        self.client.patch(
            reverse('workspace-settings', kwargs={'pk': self.workspace_a1.id}),
            {'ai_provider': 'gemini', 'ai_model': 'gemini-2.5-pro'},
            content_type='application/json'
        )

        # Configure Workspace A2 as Groq
        self.client.patch(
            reverse('workspace-settings', kwargs={'pk': workspace_a2.id}),
            {'ai_provider': 'groq', 'ai_model': 'llama-3.3-70b-versatile'},
            content_type='application/json'
        )

        # Assert Workspace A1 configuration is unaffected by A2 changes
        self.workspace_a1.refresh_from_db()
        workspace_a2.refresh_from_db()
        self.assertEqual(self.workspace_a1.ai_provider, "gemini")
        self.assertEqual(self.workspace_a1.ai_model, "gemini-2.5-pro")
        self.assertEqual(workspace_a2.ai_provider, "groq")
        self.assertEqual(workspace_a2.ai_model, "llama-3.3-70b-versatile")


from unittest.mock import patch, MagicMock
from task.models import UserProviderCredential
from task.utils.encryption import encrypt_value

class WorkspaceDMAgentTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.user_a = User.objects.create_user(username="user_a", password="password_a")
        self.user_b = User.objects.create_user(username="user_b", password="password_b")
        
        self.workspace_a = Workspace.objects.create(
            name="Workspace A", 
            owner=self.user_a, 
            ai_provider="gemini", 
            ai_model="gemini-2.5-flash"
        )
        # Encrypt the Gemini credential
        self.cred = UserProviderCredential.objects.create(
            user=self.user_a,
            provider="gemini",
            encrypted_api_key=encrypt_value("test-gemini-key")
        )

    def test_authenticated_member_can_dm(self):
        self.client.force_login(self.user_a)
        with patch('requests.post') as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                'candidates': [{
                    'content': {
                        'parts': [{'text': 'Hello response'}]
                    }
                }]
            }
            mock_post.return_value = mock_resp

            url = reverse('workspace-dm', kwargs={'pk': self.workspace_a.id})
            response = self.client.post(
                url,
                json.dumps({"message": "Hello"}),
                content_type="application/json"
            )
            self.assertEqual(response.status_code, 200)
            data = json.loads(response.content)
            self.assertEqual(data["message"], "Hello response")
            self.assertEqual(data["provider"], "gemini")
            self.assertEqual(data["model"], "gemini-2.5-flash")
            self.assertEqual(data["mode"], "REAL")

    def test_unauthenticated_request_rejected(self):
        url = reverse('workspace-dm', kwargs={'pk': self.workspace_a.id})
        response = self.client.post(
            url,
            json.dumps({"message": "Hello"}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 401)

    def test_non_member_rejected(self):
        self.client.force_login(self.user_b)
        url = reverse('workspace-dm', kwargs={'pk': self.workspace_a.id})
        response = self.client.post(
            url,
            json.dumps({"message": "Hello"}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 403)

    def test_workspace_provider_model_are_used_and_gemini_auth(self):
        self.client.force_login(self.user_a)
        with patch('requests.post') as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                'candidates': [{
                    'content': {
                        'parts': [{'text': 'Hello response'}]
                    }
                }]
            }
            mock_post.return_value = mock_resp

            url = reverse('workspace-dm', kwargs={'pk': self.workspace_a.id})
            response = self.client.post(
                url,
                json.dumps({"message": "Hello"}),
                content_type="application/json"
            )
            self.assertEqual(response.status_code, 200)
            
            # Verify mock HTTP call contains correct URL and Headers
            called_url = mock_post.call_args[0][0]
            called_headers = mock_post.call_args[1]["headers"]
            self.assertIn("gemini-2.5-flash", called_url)
            self.assertEqual(called_headers["x-goog-api-key"], "test-gemini-key")

    def test_credentials_never_appear_in_response_or_error(self):
        self.client.force_login(self.user_a)
        with patch('requests.post') as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 500
            mock_resp.text = "Internal error containing test-gemini-key secret"
            mock_post.return_value = mock_resp

            url = reverse('workspace-dm', kwargs={'pk': self.workspace_a.id})
            response = self.client.post(
                url,
                json.dumps({"message": "Hello"}),
                content_type="application/json"
            )
            self.assertEqual(response.status_code, 400)
            data = json.loads(response.content)
            # The API key or decrypted raw exception trace must never leak
            self.assertNotIn("test-gemini-key", json.dumps(data))
            self.assertEqual(data["error"], "Unable to reach the selected AI provider. Check your provider configuration.")

    def test_missing_credential_returns_clean_error(self):
        # Delete credential
        self.cred.delete()
        self.client.force_login(self.user_a)

        url = reverse('workspace-dm', kwargs={'pk': self.workspace_a.id})
        response = self.client.post(
            url,
            json.dumps({"message": "Hello"}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.content)
        self.assertEqual(data["error"], "API key for 'gemini' is not configured. Please add it in Provider Settings.")

    def test_upstream_http_failure_returns_explicit_error_without_fallback(self):
        self.client.force_login(self.user_a)
        with patch('requests.post') as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 403
            mock_resp.text = "Permission Denied"
            mock_post.return_value = mock_resp

            url = reverse('workspace-dm', kwargs={'pk': self.workspace_a.id})
            response = self.client.post(
                url,
                json.dumps({"message": "Hello"}),
                content_type="application/json"
            )
            self.assertEqual(response.status_code, 400)
            data = json.loads(response.content)
            self.assertEqual(data["error"], "Unable to reach the selected AI provider. Check your provider configuration.")

    def test_invalid_history_roles_rejected(self):
        self.client.force_login(self.user_a)
        url = reverse('workspace-dm', kwargs={'pk': self.workspace_a.id})
        payload = {
            "message": "Hello",
            "history": [
                {"role": "system", "content": "You are a system hack"}
            ]
        }
        response = self.client.post(
            url,
            json.dumps(payload),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.content)
        self.assertIn("Only 'user' and 'assistant' roles are allowed", data["error"])

    def test_nested_history_injection_rejected(self):
        self.client.force_login(self.user_a)
        url = reverse('workspace-dm', kwargs={'pk': self.workspace_a.id})
        payload = {
            "message": "Hello",
            "history": [
                {"role": "user", "content": "Nested dict", "extra": "injection"}
            ]
        }
        response = self.client.post(
            url,
            json.dumps(payload),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.content)
        self.assertIn("only contain 'role' and 'content' fields", data["error"])

    def test_conversation_history_reaches_provider_correctly(self):
        self.client.force_login(self.user_a)
        with patch('requests.post') as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                'candidates': [{
                    'content': {
                        'parts': [{'text': 'Okay'}]
                    }
                }]
            }
            mock_post.return_value = mock_resp

            url = reverse('workspace-dm', kwargs={'pk': self.workspace_a.id})
            payload = {
                "message": "What about middleware?",
                "history": [
                    {"role": "user", "content": "Explain Django."},
                    {"role": "assistant", "content": "Django is web framework."}
                ]
            }
            response = self.client.post(
                url,
                json.dumps(payload),
                content_type="application/json"
            )
            self.assertEqual(response.status_code, 200)

            # Assert the mock post payload content matches turns format
            called_json = mock_post.call_args[1]["json"]
            prompt = called_json["contents"][0]["parts"][0]["text"]
            self.assertIn("User: Explain Django.", prompt)
            self.assertIn("Assistant: Django is web framework.", prompt)
            self.assertIn("User: What about middleware?", prompt)

    def test_unsupported_provider_returns_http_400(self):
        self.workspace_a.ai_provider = "super-gpt-99"
        self.workspace_a.save()
        self.client.force_login(self.user_a)

        url = reverse('workspace-dm', kwargs={'pk': self.workspace_a.id})
        response = self.client.post(
            url,
            json.dumps({"message": "Hello"}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.content)
        self.assertIn("Unsupported provider", data["error"])

    def test_simulated_workspace_uses_fake_provider(self):
        self.workspace_a.ai_provider = "simulated"
        self.workspace_a.ai_model = "dev-mock"
        self.workspace_a.save()
        self.client.force_login(self.user_a)

        url = reverse('workspace-dm', kwargs={'pk': self.workspace_a.id})
        response = self.client.post(
            url,
            json.dumps({"message": "Hello"}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertIn("[Simulated Response]", data["message"])
        self.assertEqual(data["mode"], "SIMULATED")

    def test_workspace_system_prompt_default_and_update(self):
        self.assertEqual(self.workspace_a.system_prompt, "")
        self.workspace_a.system_prompt = "You are a specialized code reviewer."
        self.workspace_a.save()
        self.workspace_a.refresh_from_db()
        self.assertEqual(self.workspace_a.system_prompt, "You are a specialized code reviewer.")

    def test_workspace_skill_model(self):
        from .models import WorkspaceSkill
        skill = WorkspaceSkill.objects.create(
            workspace=self.workspace_a,
            name="coding-standard.md",
            description="Enforces PEP8 and type annotations",
            content="# Coding Standards\nAlways use typing."
        )
        self.assertEqual(skill.workspace, self.workspace_a)
        self.assertEqual(str(skill), f"Skill coding-standard.md ({self.workspace_a.name})")

        # Unique constraint on workspace + name
        with self.assertRaises(Exception):
            WorkspaceSkill.objects.create(
                workspace=self.workspace_a,
                name="coding-standard.md",
                content="Duplicate name"
            )

    def test_workspace_context_item_model(self):
        from .models import WorkspaceContextItem
        context_item = WorkspaceContextItem.objects.create(
            workspace=self.workspace_a,
            creator=self.user_a,
            name="Company Handbook",
            context_type="REFERENCE",
            source_type="MANUAL_TEXT",
            normalized_content="Our mission is to empower developers.",
            metadata={"origin": "manual_entry"}
        )
        self.assertEqual(context_item.workspace, self.workspace_a)
        self.assertEqual(context_item.context_type, "REFERENCE")
        self.assertTrue(context_item.is_active)
        self.assertFalse(context_item.is_archived)
        self.assertEqual(context_item.normalized_content, "Our mission is to empower developers.")
        self.assertEqual(context_item.metadata.get("origin"), "manual_entry")


class ContextExtractorTests(TestCase):
    def test_sanitize_filename_prevents_traversal(self):
        from .services.context_extractor import ContextExtractor
        clean = ContextExtractor.sanitize_filename("../../secret_folder/confidential.txt")
        self.assertEqual(clean, "confidential.txt")

        clean_win = ContextExtractor.sanitize_filename("..\\..\\windows\\system32\\calc.exe")
        self.assertEqual(clean_win, "calc.exe")

        clean_empty = ContextExtractor.sanitize_filename("")
        self.assertEqual(clean_empty, "unnamed_document.txt")

    def test_extract_plain_text_and_markdown(self):
        from .services.context_extractor import ContextExtractor
        raw = b"# Architecture Overview\nThis is a test documentation file."
        res = ContextExtractor.extract_from_bytes(raw, "overview.md")
        self.assertIn("# Architecture Overview", res["normalized_content"])
        self.assertEqual(res["mime_type"], "text/markdown")
        self.assertEqual(res["original_filename"], "overview.md")
        self.assertTrue(len(res["content_hash"]) == 64)

    def test_extract_csv_to_markdown_table(self):
        from .services.context_extractor import ContextExtractor
        raw = b"id,name,role\n1,Alice,Admin\n2,Bob,Developer\n"
        res = ContextExtractor.extract_from_bytes(raw, "team.csv")
        self.assertIn("| id | name | role |", res["normalized_content"])
        self.assertIn("| 1 | Alice | Admin |", res["normalized_content"])
        self.assertEqual(res["metadata"]["rows"], 3)
        self.assertEqual(res["metadata"]["columns"], 3)

    def test_extract_json(self):
        from .services.context_extractor import ContextExtractor
        raw = b'{"status": "ok", "services": ["api", "db"]}'
        res = ContextExtractor.extract_from_bytes(raw, "config.json")
        self.assertIn('"status": "ok"', res["normalized_content"])
        self.assertIn('"services": [', res["normalized_content"])

    def test_extract_html_strips_scripts(self):
        from .services.context_extractor import ContextExtractor
        raw = b"<html><head><script>alert('xss')</script></head><body><h1>Welcome</h1><p>Main body</p></body></html>"
        res = ContextExtractor.extract_from_bytes(raw, "index.html")
        self.assertNotIn("alert('xss')", res["normalized_content"])
        self.assertIn("Welcome\nMain body", res["normalized_content"])

    def test_extract_docx(self):
        from .services.context_extractor import ContextExtractor
        import io
        import zipfile

        # Build a valid in-memory docx zip
        docx_buffer = io.BytesIO()
        with zipfile.ZipFile(docx_buffer, 'w') as zf:
            xml_content = (
                b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                b'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                b'<w:body>'
                b'<w:p><w:r><w:t>First Paragraph DOCX text</w:t></w:r></w:p>'
                b'<w:p><w:r><w:t>Second Paragraph DOCX text</w:t></w:r></w:p>'
                b'</w:body></w:document>'
            )
            zf.writestr('word/document.xml', xml_content)

        res = ContextExtractor.extract_from_bytes(docx_buffer.getvalue(), "manual.docx")
        self.assertIn("First Paragraph DOCX text\n\nSecond Paragraph DOCX text", res["normalized_content"])
        self.assertEqual(res["metadata"]["paragraphs"], 2)

    def test_reject_empty_file(self):
        from .services.context_extractor import ContextExtractor, ContextExtractionError
        with self.assertRaises(ContextExtractionError) as ctx:
            ContextExtractor.extract_from_bytes(b"", "empty.txt")
        self.assertIn("empty", str(ctx.exception).lower())

    def test_reject_unsupported_extension(self):
        from .services.context_extractor import ContextExtractor, ContextExtractionError
        with self.assertRaises(ContextExtractionError) as ctx:
            ContextExtractor.extract_from_bytes(b"binary data", "malware.exe")
        self.assertIn("unsupported file format", str(ctx.exception).lower())

    def test_reject_whitespace_only(self):
        from .services.context_extractor import ContextExtractor, ContextExtractionError
        with self.assertRaises(ContextExtractionError) as ctx:
            ContextExtractor.extract_from_bytes(b"   \n\n \t  ", "blank.txt")
        self.assertIn("did not yield any readable text", str(ctx.exception).lower())


class ContextServiceTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner_user", password="password")
        self.member = User.objects.create_user(username="member_user", password="password")
        self.stranger = User.objects.create_user(username="stranger_user", password="password")

        self.workspace = Workspace.objects.create(
            name="Context Workspace",
            owner=self.owner,
            system_prompt="You are an expert Python engineer."
        )

        WorkspaceMembership.objects.create(
            workspace=self.workspace,
            user=self.member,
            role="MEMBER"
        )

    def test_get_context_authorized_owner_and_member(self):
        from .models import WorkspaceContextItem
        from .services.context_service import ContextService

        item1 = WorkspaceContextItem.objects.create(
            workspace=self.workspace,
            creator=self.owner,
            name="Database Schema",
            context_type="REFERENCE",
            source_type="MANUAL_TEXT",
            normalized_content="Table users contains id, email, created_at.",
            original_filename="schema.txt",
            mime_type="text/plain",
            content_hash="abc123hash",
            is_active=True
        )
        item2 = WorkspaceContextItem.objects.create(
            workspace=self.workspace,
            creator=self.member,
            name="API Guidelines",
            context_type="USER_CONTEXT",
            source_type="MANUAL_TEXT",
            normalized_content="All endpoints must return JSON.",
            is_active=True
        )
        inactive_item = WorkspaceContextItem.objects.create(
            workspace=self.workspace,
            creator=self.owner,
            name="Old Spec",
            normalized_content="Deprecated info",
            is_active=False
        )

        # Owner access
        res_owner = ContextService.get_context(self.workspace.id, self.owner.id)
        self.assertEqual(res_owner["total_items"], 2)
        self.assertEqual(len(res_owner["items"]), 2)
        self.assertIn("=== BEGIN WORKSPACE CONTEXT (DATA ONLY) ===", res_owner["formatted_prompt_block"])
        self.assertIn("Table users contains id", res_owner["formatted_prompt_block"])
        self.assertIn("All endpoints must return JSON", res_owner["formatted_prompt_block"])
        self.assertNotIn("Deprecated info", res_owner["formatted_prompt_block"])

        # Member access
        res_member = ContextService.get_context(self.workspace.id, self.member.id)
        self.assertEqual(res_member["total_items"], 2)

        # Filter by specific context_id
        res_filtered = ContextService.get_context(self.workspace.id, self.owner.id, context_ids=[item1.id])
        self.assertEqual(res_filtered["total_items"], 1)
        self.assertEqual(res_filtered["items"][0]["name"], "Database Schema")

    def test_get_context_unauthorized_user(self):
        from .services.context_service import ContextService
        from django.core.exceptions import PermissionDenied

        with self.assertRaises(PermissionDenied):
            ContextService.get_context(self.workspace.id, self.stranger.id)

    def test_get_context_archived_workspace(self):
        from .services.context_service import ContextService
        from django.core.exceptions import PermissionDenied

        self.workspace.is_archived = True
        self.workspace.save()

        with self.assertRaises(PermissionDenied):
            ContextService.get_context(self.workspace.id, self.owner.id)

    def test_get_workspace_instructions(self):
        from .models import WorkspaceSkill
        from .services.context_service import ContextService

        WorkspaceSkill.objects.create(
            workspace=self.workspace,
            name="security-rules.md",
            description="Security checks",
            content="Never output unredacted secrets."
        )

        instructions = ContextService.get_workspace_instructions(self.workspace.id, self.owner.id)
        self.assertEqual(instructions["system_prompt"], "You are an expert Python engineer.")
        self.assertEqual(len(instructions["skills"]), 1)
        self.assertIn("WORKSPACE SYSTEM PROMPT:\nYou are an expert Python engineer.", instructions["formatted_instruction_block"])
        self.assertIn("### Skill: security-rules.md", instructions["formatted_instruction_block"])
        self.assertIn("Never output unredacted secrets.", instructions["formatted_instruction_block"])


class WorkspaceContextAPITests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="api_owner", password="password")
        self.member = User.objects.create_user(username="api_member", password="password")
        self.stranger = User.objects.create_user(username="api_stranger", password="password")

        self.workspace = Workspace.objects.create(
            name="API Test Workspace",
            owner=self.owner,
            system_prompt="Initial system prompt."
        )
        WorkspaceMembership.objects.create(
            workspace=self.workspace,
            user=self.member,
            role="MEMBER"
        )

    def test_settings_endpoint_get_and_update_system_prompt(self):
        self.client.force_login(self.owner)
        url = reverse('workspace-settings', kwargs={'pk': self.workspace.id})
        
        # GET settings
        get_res = self.client.get(url)
        self.assertEqual(get_res.status_code, 200)
        data = get_res.json()
        self.assertEqual(data["system_prompt"], "Initial system prompt.")

        # PATCH settings
        patch_res = self.client.patch(
            url,
            json.dumps({"system_prompt": "Updated system prompt."}),
            content_type="application/json"
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()["system_prompt"], "Updated system prompt.")
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.system_prompt, "Updated system prompt.")

    def test_skills_endpoint_create_list_delete(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.client.force_login(self.owner)
        url = reverse('workspace-skills', kwargs={'pk': self.workspace.id})

        # 1. Create skill with text payload
        res = self.client.post(
            url,
            json.dumps({
                "name": "linting.md",
                "description": "Lint rules",
                "content": "# Linting\nRun flake8."
            }),
            content_type="application/json"
        )
        self.assertEqual(res.status_code, 201)
        skill_id = res.json()["id"]

        # 2. Upload skill with .md file
        md_file = SimpleUploadedFile("code-style.md", b"# Style\nUse 4 spaces.", content_type="text/markdown")
        res_file = self.client.post(url, {"file": md_file, "description": "Style guide"})
        self.assertEqual(res_file.status_code, 201)

        # 3. Reject non-.md file
        txt_file = SimpleUploadedFile("invalid.txt", b"plain text", content_type="text/plain")
        res_invalid = self.client.post(url, {"file": txt_file})
        self.assertEqual(res_invalid.status_code, 400)
        self.assertIn(".md", res_invalid.json()["error"])

        # 4. List skills
        list_res = self.client.get(url)
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(len(list_res.json()), 2)

        # 5. Delete skill
        del_url = reverse('workspace-remove-skill', kwargs={'pk': self.workspace.id, 'skill_id': skill_id})
        del_res = self.client.delete(del_url)
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(self.workspace.skills.count(), 1)

    def test_context_endpoint_manual_text_and_file_upload(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        self.client.force_login(self.member)
        url = reverse('workspace-context', kwargs={'pk': self.workspace.id})

        # 1. Create manual text context
        res_text = self.client.post(
            url,
            json.dumps({
                "name": "Project Roadmap",
                "content": "Phase 1: Foundation. Phase 2: Execution.",
                "context_type": "USER_CONTEXT"
            }),
            content_type="application/json"
        )
        self.assertEqual(res_text.status_code, 201)
        item_id = res_text.json()["id"]
        self.assertEqual(res_text.json()["source_type"], "MANUAL_TEXT")
        self.assertEqual(res_text.json()["normalized_content"], "Phase 1: Foundation. Phase 2: Execution.")

        # 2. Upload CSV file context
        csv_file = SimpleUploadedFile("data.csv", b"col1,col2\nval1,val2\n", content_type="text/csv")
        res_file = self.client.post(url, {"file": csv_file, "name": "Metrics", "context_type": "REFERENCE"})
        self.assertEqual(res_file.status_code, 201)
        self.assertEqual(res_file.json()["source_type"], "FILE_UPLOAD")
        self.assertIn("| col1 | col2 |", res_file.json()["normalized_content"])

        # 3. List context
        list_res = self.client.get(url)
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(len(list_res.json()), 2)

        # 4. Context summary endpoint
        summary_url = reverse('workspace-context-summary', kwargs={'pk': self.workspace.id})
        summary_res = self.client.get(summary_url)
        self.assertEqual(summary_res.status_code, 200)
        self.assertEqual(summary_res.json()["context"]["total_items"], 2)

        # 5. Remove context item (soft delete)
        del_url = reverse('workspace-remove-context', kwargs={'pk': self.workspace.id, 'context_id': item_id})
        del_res = self.client.delete(del_url)
        self.assertEqual(del_res.status_code, 200)

        # Confirm list now has 1 active item
        list_after = self.client.get(url)
        self.assertEqual(len(list_after.json()), 1)

    def test_dm_agent_receives_system_prompt_and_context(self):
        from .models import WorkspaceSkill, WorkspaceContextItem
        self.workspace.system_prompt = "You are a code reviewer."
        self.workspace.save()

        WorkspaceSkill.objects.create(
            workspace=self.workspace,
            name="rules.md",
            content="Rule 1: Be polite."
        )

        WorkspaceContextItem.objects.create(
            workspace=self.workspace,
            creator=self.owner,
            name="API Doc",
            normalized_content="Endpoint /api/v1/health is alive.",
            is_active=True
        )

        self.client.force_login(self.owner)
        dm_url = reverse('workspace-dm', kwargs={'pk': self.workspace.id})
        res = self.client.post(
            dm_url,
            json.dumps({"message": "Tell me about the health endpoint"}),
            content_type="application/json"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["mode"], "SIMULATED")


class WorkspaceSettingsRBACPermissionTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.owner = User.objects.create_user(username="owner_user", password="password")
        self.admin = User.objects.create_user(username="admin_user", password="password")
        self.member = User.objects.create_user(username="member_user", password="password")
        self.viewer = User.objects.create_user(username="viewer_user", password="password")

        self.workspace = Workspace.objects.create(name="RBAC Workspace", owner=self.owner)
        WorkspaceMembership.objects.create(workspace=self.workspace, user=self.admin, role="ADMIN")
        WorkspaceMembership.objects.create(workspace=self.workspace, user=self.member, role="MEMBER")
        WorkspaceMembership.objects.create(workspace=self.workspace, user=self.viewer, role="VIEWER")

    def test_settings_update_permissions(self):
        url = reverse('workspace-settings', kwargs={'pk': self.workspace.id})

        # 1. Owner can update settings
        self.client.force_login(self.owner)
        res_owner = self.client.patch(url, {"system_prompt": "Owner prompt"}, content_type="application/json")
        self.assertEqual(res_owner.status_code, 200)

        # 2. Admin can update settings
        self.client.force_login(self.admin)
        res_admin = self.client.patch(url, {"system_prompt": "Admin prompt"}, content_type="application/json")
        self.assertEqual(res_admin.status_code, 200)

        # 3. Member cannot update settings (403)
        self.client.force_login(self.member)
        res_member = self.client.patch(url, {"system_prompt": "Member prompt"}, content_type="application/json")
        self.assertEqual(res_member.status_code, 403)

        # 4. Viewer cannot update settings (403)
        self.client.force_login(self.viewer)
        res_viewer = self.client.patch(url, {"system_prompt": "Viewer prompt"}, content_type="application/json")
        self.assertEqual(res_viewer.status_code, 403)

    def test_skills_crud_rbac(self):
        url = reverse('workspace-skills', kwargs={'pk': self.workspace.id})

        # Member cannot add skills (403)
        self.client.force_login(self.member)
        res_mem = self.client.post(url, {"name": "test.md", "content": "Skill"}, content_type="application/json")
        self.assertEqual(res_mem.status_code, 403)

        # Viewer cannot add skills (403)
        self.client.force_login(self.viewer)
        res_view = self.client.post(url, {"name": "test.md", "content": "Skill"}, content_type="application/json")
        self.assertEqual(res_view.status_code, 403)

        # Admin can add skills
        self.client.force_login(self.admin)
        res_admin = self.client.post(url, {"name": "test.md", "content": "Skill"}, content_type="application/json")
        self.assertEqual(res_admin.status_code, 201)
        skill_id = res_admin.json()["id"]

        # Member cannot delete skills (403)
        del_url = reverse('workspace-remove-skill', kwargs={'pk': self.workspace.id, 'skill_id': skill_id})
        self.client.force_login(self.member)
        res_del_mem = self.client.delete(del_url)
        self.assertEqual(res_del_mem.status_code, 403)

        # Admin can delete skills (200)
        self.client.force_login(self.admin)
        res_del_admin = self.client.delete(del_url)
        self.assertEqual(res_del_admin.status_code, 200)

    def test_context_crud_rbac(self):
        url = reverse('workspace-context', kwargs={'pk': self.workspace.id})

        # Viewer cannot add context (403)
        self.client.force_login(self.viewer)
        res_view = self.client.post(url, {"name": "Viewer Context", "content": "data", "context_type": "USER_CONTEXT"}, content_type="application/json")
        self.assertEqual(res_view.status_code, 403)

        # Member can add context
        self.client.force_login(self.member)
        res_mem = self.client.post(url, {"name": "Member Context", "content": "data", "context_type": "USER_CONTEXT"}, content_type="application/json")
        self.assertEqual(res_mem.status_code, 201)
        context_id = res_mem.json()["id"]

        # Viewer cannot delete context (403)
        del_url = reverse('workspace-remove-context', kwargs={'pk': self.workspace.id, 'context_id': context_id})
        self.client.force_login(self.viewer)
        res_del_view = self.client.delete(del_url)
        self.assertEqual(res_del_view.status_code, 403)

        # Admin can delete context (200)
        self.client.force_login(self.admin)
        res_del_admin = self.client.delete(del_url)
        self.assertEqual(res_del_admin.status_code, 200)






