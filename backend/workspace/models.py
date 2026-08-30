from django.db import models
from django.contrib.auth.models import User
import uuid

class Workspace(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_workspaces')
    system_prompt = models.TextField(blank=True, default='')
    is_archived = models.BooleanField(default=False)
    ai_provider = models.CharField(max_length=100, default='simulated')
    ai_model = models.CharField(max_length=100, default='dev-mock')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    scheduled_deletion_at = models.DateTimeField(null=True, blank=True)

    # Institutional Intelligence Settings
    context_window_limit = models.IntegerField(default=4000)
    institutional_knowledge_enabled = models.BooleanField(default=True)
    policy_engine_enabled = models.BooleanField(default=True)
    workflow_execution_enabled = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

class WorkspaceMembership(models.Model):
    ROLE_ADMIN = 'ADMIN'
    ROLE_MEMBER = 'MEMBER'
    ROLE_VIEWER = 'VIEWER'

    ROLE_CHOICES = [
        (ROLE_ADMIN, 'Admin'),
        (ROLE_MEMBER, 'Member'),
        (ROLE_VIEWER, 'Viewer'),
    ]

    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='workspace_memberships')
    role = models.CharField(max_length=50, default=ROLE_MEMBER, choices=ROLE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('workspace', 'user')

    def __str__(self):
        return f"{self.user.username} in {self.workspace.name} ({self.role})"

class WorkspaceSkill(models.Model):
    """
    Behavioral instructions/rules for agents in the workspace.
    Skills accept markdown files (.md) only and are strictly part of the instruction layer.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='skills')
    name = models.CharField(max_length=255)
    description = models.CharField(max_length=500, blank=True, default='')
    content = models.TextField() # Markdown rules/instructions
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('workspace', 'name')
        ordering = ['name']

    def __str__(self):
        return f"Skill {self.name} ({self.workspace.name})"

class WorkspaceContextItem(models.Model):
    """
    Data and knowledge layer for the workspace.
    Context items are DATA, never executable instructions.
    Includes rich provenance, normalization state, and verification metadata.
    """
    CONTEXT_TYPES = [
        ('USER_CONTEXT', 'User Context'),
        ('REFERENCE', 'Reference Document'),
        ('INSTITUTIONAL_REFERENCE', 'Institutional Reference'),
    ]

    SOURCE_TYPES = [
        ('MANUAL_TEXT', 'Manual Text'),
        ('FILE_UPLOAD', 'File Upload'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='context_items')
    creator = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_context_items')
    name = models.CharField(max_length=255)
    context_type = models.CharField(max_length=50, choices=CONTEXT_TYPES, default='USER_CONTEXT')
    source_type = models.CharField(max_length=50, choices=SOURCE_TYPES, default='MANUAL_TEXT')
    
    # Provenance and file metadata
    raw_file = models.FileField(upload_to='workspace_context/', null=True, blank=True)
    original_filename = models.CharField(max_length=255, blank=True, default='')
    mime_type = models.CharField(max_length=100, blank=True, default='text/plain')
    content_hash = models.CharField(max_length=64, blank=True, default='')
    file_size = models.BigIntegerField(default=0)

    # Normalized text content for safe delivery to agent
    normalized_content = models.TextField(blank=True, default='')

    # Lifecycle & status
    is_active = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)

    # Extended provenance & verification
    metadata = models.JSONField(default=dict, blank=True)
    verification_metadata = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['workspace', 'is_active', 'is_archived']),
            models.Index(fields=['workspace', 'context_type']),
        ]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.context_type == 'INSTITUTIONAL_REFERENCE' and self.is_active and not self.is_archived:
            try:
                from task.services.rag_service import RAGService
                RAGService.chunk_and_store_document(self)
            except Exception:
                pass

    def __str__(self):
        return f"{self.name} [{self.context_type}] ({self.workspace.name})"


class WorkspaceContextItemChunk(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    context_item = models.ForeignKey(WorkspaceContextItem, on_delete=models.CASCADE, related_name='chunks')
    chunk_index = models.IntegerField()
    content = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['chunk_index']
        unique_together = ('context_item', 'chunk_index')
        indexes = [
            models.Index(fields=['context_item']),
        ]

    def __str__(self):
        return f"Chunk {self.chunk_index} of {self.context_item.name}"
