from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Workspace, WorkspaceMembership, WorkspaceSkill, WorkspaceContextItem

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name']

class WorkspaceSkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkspaceSkill
        fields = ['id', 'workspace', 'name', 'description', 'content', 'created_at', 'updated_at']
        read_only_fields = ['id', 'workspace', 'created_at', 'updated_at']

    def validate_name(self, value):
        clean_name = value.strip()
        if not clean_name.lower().endswith('.md'):
            raise serializers.ValidationError("Skill file name must end with '.md' extension.")
        return clean_name

    def validate_content(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Skill markdown content cannot be empty.")
        return value

class WorkspaceContextItemSerializer(serializers.ModelSerializer):
    creator = UserSerializer(read_only=True)

    class Meta:
        model = WorkspaceContextItem
        fields = [
            'id', 'workspace', 'creator', 'name', 'context_type', 'source_type',
            'raw_file', 'original_filename', 'mime_type', 'content_hash', 'file_size',
            'normalized_content', 'is_active', 'is_archived', 'metadata',
            'verification_metadata', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'workspace', 'creator', 'original_filename', 'mime_type',
            'content_hash', 'file_size', 'created_at', 'updated_at'
        ]

class WorkspaceSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    role = serializers.SerializerMethodField()
    skills_count = serializers.SerializerMethodField()
    context_count = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = [
            'id', 'name', 'owner', 'role', 'is_archived', 'system_prompt',
            'created_at', 'updated_at', 'archived_at', 'scheduled_deletion_at',
            'ai_provider', 'ai_model', 'skills_count', 'context_count',
            'context_window_limit', 'institutional_knowledge_enabled',
            'policy_engine_enabled', 'workflow_execution_enabled'
        ]
        read_only_fields = [
            'id', 'owner', 'role', 'is_archived', 
            'created_at', 'updated_at', 'archived_at', 'scheduled_deletion_at',
            'skills_count', 'context_count'
        ]

    def get_role(self, obj):
        request = self.context.get('request')
        if request and request.user:
            if obj.owner == request.user:
                return 'OWNER'
            membership = obj.memberships.filter(user=request.user).first()
            if membership:
                return membership.role
        return None

    def get_skills_count(self, obj):
        return obj.skills.count()

    def get_context_count(self, obj):
        return obj.context_items.filter(is_active=True, is_archived=False).count()

class WorkspaceMembershipSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), source='user', write_only=True, required=False
    )
    role = serializers.ChoiceField(
        choices=WorkspaceMembership.ROLE_CHOICES,
        default=WorkspaceMembership.ROLE_MEMBER,
        required=False
    )

    class Meta:
        model = WorkspaceMembership
        fields = ['id', 'user', 'user_id', 'role', 'created_at']
        read_only_fields = ['id', 'created_at']


