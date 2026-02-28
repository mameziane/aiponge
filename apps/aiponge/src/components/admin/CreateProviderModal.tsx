import { useState, useMemo, useCallback, useEffect, useRef, type ComponentProps } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  Modal,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { useCreateProvider, useDiscoverProviders, type DiscoveredProvider } from '../../hooks/admin';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH * 0.72;
const CARD_MARGIN = 8;

const CATEGORY_COLORS: Record<string, string> = {
  LLM: '#10a37f',
  Image: '#9333ea',
  Music: '#ec4899',
  Audio: '#f59e0b',
  Video: '#6366f1',
};

const CATEGORY_ICONS: Record<string, string> = {
  LLM: 'chatbubble-ellipses-outline',
  Image: 'image-outline',
  Music: 'musical-notes-outline',
  Audio: 'mic-outline',
  Video: 'videocam-outline',
};

interface CreateProviderModalProps {
  visible: boolean;
  onClose: () => void;
}

type Step = 'catalog' | 'form';

export function CreateProviderModal({ visible, onClose }: CreateProviderModalProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.bottom), [colors, insets.bottom]);
  const createMutation = useCreateProvider();
  const discoverMutation = useDiscoverProviders();

  const [step, setStep] = useState<Step>('catalog');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const [providerId, setProviderId] = useState('');
  const [providerName, setProviderName] = useState('');
  const [providerType, setProviderType] = useState<'llm' | 'music' | 'image' | 'video' | 'audio' | 'text'>('llm');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('100');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [timeout, setTimeout] = useState('30000');
  const [costPerUnit, setCostPerUnit] = useState('0.000001');
  const [creditCost, setCreditCost] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [isPrimary, setIsPrimary] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);

  const suggestions = discoverMutation.data?.providers || [];

  const categories = useMemo(() => {
    const cats = new Set(suggestions.map(s => s.category));
    return ['All', ...Array.from(cats).sort()];
  }, [suggestions]);

  const filteredSuggestions = useMemo(() => {
    if (activeCategory === 'All') return suggestions;
    return suggestions.filter(s => s.category === activeCategory);
  }, [suggestions, activeCategory]);

  const categoryCount = useCallback(
    (cat: string) => {
      if (cat === 'All') return suggestions.length;
      return suggestions.filter(s => s.category === cat).length;
    },
    [suggestions]
  );

  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (visible && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      discoverMutation.mutate();
    }
    if (!visible) {
      hasTriggeredRef.current = false;
    }
  }, [visible]);

  const resetForm = useCallback(() => {
    setProviderId('');
    setProviderName('');
    setProviderType('llm');
    setDescription('');
    setPriority('100');
    setEndpoint('');
    setModel('');
    setTimeout('30000');
    setCostPerUnit('0.000001');
    setCreditCost('1');
    setIsActive(true);
    setIsPrimary(false);
    setShowTypePicker(false);
    setStep('catalog');
    setActiveCategory('All');
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    createMutation.reset();
    onClose();
  }, [resetForm, createMutation, onClose]);

  const handleSelectProvider = useCallback((provider: DiscoveredProvider) => {
    setProviderId(provider.providerId);
    setProviderName(provider.providerName);
    setProviderType(provider.providerType);
    setDescription(provider.description);
    setPriority(String(provider.priority));
    setEndpoint(provider.endpoint);
    setModel(provider.model);
    setTimeout(String(provider.timeout));
    setCostPerUnit(provider.costPerUnit);
    setCreditCost(String(provider.creditCost));
    setIsActive(true);
    setIsPrimary(false);
    setStep('form');
  }, []);

  const handleCustomProvider = useCallback(() => {
    resetForm();
    setStep('form');
  }, [resetForm]);

  const handleSave = async () => {
    if (!providerId.trim() || !providerName.trim() || !endpoint.trim()) return;

    const configuration: Record<string, unknown> = {
      endpoint: endpoint.trim(),
      timeout: parseInt(timeout, 10) || 30000,
      requestTemplate: {
        model: model.trim(),
      },
    };

    try {
      await createMutation.mutateAsync({
        providerId: providerId.trim(),
        providerName: providerName.trim(),
        providerType,
        description: description.trim() || undefined,
        configuration,
        isActive,
        isPrimary,
        priority: parseInt(priority, 10) || 100,
        costPerUnit: costPerUnit.trim() || '0.000001',
        creditCost: parseInt(creditCost, 10) || 1,
      });
      resetForm();
      discoverMutation.reset();
      onClose();
    } catch {
      // error is displayed via createMutation.isError
    }
  };

  const isFormValid = Boolean(providerId.trim() && providerName.trim() && endpoint.trim());

  const renderCatalogCard = useCallback(
    ({ item }: { item: DiscoveredProvider }) => {
      const color = CATEGORY_COLORS[item.category] || colors.brand.primary;
      const icon = CATEGORY_ICONS[item.category] || 'cube-outline';
      return (
        <TouchableOpacity
          style={[styles.catalogCard, { borderColor: color + '40' }]}
          onPress={() => handleSelectProvider(item)}
          activeOpacity={0.7}
        >
          <View style={[styles.catalogCardHeader, { backgroundColor: color + '15' }]}>
            <View style={[styles.catalogIconCircle, { backgroundColor: color + '25' }]}>
              <Ionicons name={icon as ComponentProps<typeof Ionicons>['name']} size={22} color={color} />
            </View>
            <View style={styles.catalogCardBadge}>
              <Text style={[styles.catalogCardBadgeText, { color }]}>{item.category}</Text>
            </View>
          </View>
          <View style={styles.catalogCardBody}>
            <Text style={styles.catalogCardName} numberOfLines={1}>
              {item.providerName}
            </Text>
            <Text style={styles.catalogCardModel} numberOfLines={1}>
              {item.model}
            </Text>
            <Text style={styles.catalogCardDesc} numberOfLines={2}>
              {item.description}
            </Text>
            <View style={styles.catalogCardMeta}>
              <View style={styles.catalogCardMetaItem}>
                <Text style={styles.catalogCardMetaLabel}>Cost</Text>
                <Text style={styles.catalogCardMetaValue}>${item.costPerUnit}</Text>
              </View>
              <View style={styles.catalogCardMetaItem}>
                <Text style={styles.catalogCardMetaLabel}>Credits</Text>
                <Text style={styles.catalogCardMetaValue}>{item.creditCost}</Text>
              </View>
              <View style={styles.catalogCardMetaItem}>
                <Text style={styles.catalogCardMetaLabel}>Priority</Text>
                <Text style={styles.catalogCardMetaValue}>{item.priority}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.catalogCardFooter, { borderTopColor: color + '20' }]}>
            <Text style={[styles.catalogCardSelect, { color }]}>Select & Configure</Text>
            <Ionicons name="arrow-forward" size={16} color={color} />
          </View>
        </TouchableOpacity>
      );
    },
    [styles, handleSelectProvider, colors.brand.primary]
  );

  const renderCatalogStep = () => (
    <>
      <View style={styles.modalHeader}>
        <View>
          <Text style={styles.modalTitle}>Discover Providers</Text>
          <Text style={styles.modalSubtitle}>
            {discoverMutation.isPending
              ? 'Searching for providers...'
              : suggestions.length > 0
                ? `${suggestions.length} alternatives found`
                : 'Find new AI providers to add'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleClose}>
          <Ionicons name="close" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      {suggestions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryBar}
          contentContainerStyle={styles.categoryBarContent}
        >
          {categories.map(cat => {
            const count = categoryCount(cat);
            const isActiveCat = activeCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, isActiveCat && styles.categoryChipActive]}
                onPress={() => setActiveCategory(cat)}
              >
                <Text style={[styles.categoryChipText, isActiveCat && styles.categoryChipTextActive]}>{cat}</Text>
                <View style={[styles.categoryChipCount, isActiveCat && styles.categoryChipCountActive]}>
                  <Text style={[styles.categoryChipCountText, isActiveCat && styles.categoryChipCountTextActive]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {discoverMutation.isPending ? (
        <View style={styles.discoveryLoading}>
          <ActivityIndicator size="large" color={colors.brand.primary} />
          <Text style={styles.discoveryLoadingTitle}>Analyzing your providers...</Text>
          <Text style={styles.discoveryLoadingSubtitle}>
            Searching for alternatives across LLM, Image, Music, Audio, and Video categories
          </Text>
        </View>
      ) : discoverMutation.isError ? (
        <View style={styles.discoveryError}>
          <Ionicons name="warning-outline" size={40} color={colors.semantic.error} />
          <Text style={styles.discoveryErrorTitle}>Discovery failed</Text>
          <Text style={styles.discoveryErrorSubtitle}>
            {(discoverMutation.error as Error)?.message || 'Could not reach AI service'}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => discoverMutation.mutate()}>
            <Ionicons name="refresh" size={16} color={colors.brand.primary} />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : filteredSuggestions.length > 0 ? (
        <FlatList
          data={filteredSuggestions}
          renderItem={renderCatalogCard}
          keyExtractor={item => item.providerId}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catalogList}
          snapToInterval={CARD_WIDTH + CARD_MARGIN * 2}
          decelerationRate="fast"
        />
      ) : suggestions.length > 0 ? (
        <View style={styles.emptyCategory}>
          <Ionicons name="checkmark-circle-outline" size={40} color={colors.text.tertiary} />
          <Text style={styles.emptyCategoryText}>No providers in this category</Text>
        </View>
      ) : null}

      <View style={styles.modalFooter}>
        {suggestions.length > 0 && (
          <TouchableOpacity
            style={styles.rediscoverButton}
            onPress={() => {
              discoverMutation.reset();
              discoverMutation.mutate();
            }}
            disabled={discoverMutation.isPending}
          >
            <Ionicons name="sparkles-outline" size={16} color={colors.brand.primary} />
            <Text style={styles.rediscoverText}>Rediscover</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.customProviderButton} onPress={handleCustomProvider}>
          <Ionicons name="create-outline" size={16} color={colors.text.secondary} />
          <Text style={styles.customProviderText}>Manual Entry</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderFormStep = () => (
    <>
      <View style={styles.modalHeader}>
        <View style={styles.formHeaderRow}>
          <TouchableOpacity onPress={() => setStep('catalog')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Configure Provider</Text>
        </View>
        <TouchableOpacity onPress={handleClose}>
          <Ionicons name="close" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>General</Text>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Provider ID *</Text>
            <Text style={styles.formHint}>Unique slug (e.g. "openai-gpt4")</Text>
            <TextInput
              style={styles.textInput}
              value={providerId}
              onChangeText={setProviderId}
              placeholder="openai-gpt4"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Provider Name *</Text>
            <TextInput
              style={styles.textInput}
              value={providerName}
              onChangeText={setProviderName}
              placeholder="OpenAI GPT-4"
              placeholderTextColor={colors.text.tertiary}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Provider Type *</Text>
            <TouchableOpacity style={styles.selectInput} onPress={() => setShowTypePicker(!showTypePicker)}>
              <Text style={styles.selectInputText}>{providerType.toUpperCase()}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
            </TouchableOpacity>
            {showTypePicker && (
              <View style={styles.pickerDropdown}>
                {(['llm', 'music', 'image', 'video', 'audio', 'text'] as const).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.pickerOption, providerType === type && styles.pickerOptionSelected]}
                    onPress={() => {
                      setProviderType(type);
                      setShowTypePicker(false);
                    }}
                  >
                    <Text style={[styles.pickerOptionText, providerType === type && styles.pickerOptionTextSelected]}>
                      {type.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Optional description"
              placeholderTextColor={colors.text.tertiary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Priority *</Text>
            <Text style={styles.formHint}>Lower value = higher priority for failover</Text>
            <TextInput
              style={styles.textInput}
              value={priority}
              onChangeText={setPriority}
              keyboardType="numeric"
              placeholder="100"
              placeholderTextColor={colors.text.tertiary}
            />
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>API Configuration</Text>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Endpoint URL *</Text>
            <TextInput
              style={styles.textInput}
              value={endpoint}
              onChangeText={setEndpoint}
              placeholder="https://api.openai.com/v1/chat/completions"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Model</Text>
            <TextInput
              style={styles.textInput}
              value={model}
              onChangeText={setModel}
              placeholder="gpt-4"
              placeholderTextColor={colors.text.tertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Timeout (ms)</Text>
            <TextInput
              style={styles.textInput}
              value={timeout}
              onChangeText={setTimeout}
              keyboardType="numeric"
              placeholder="30000"
              placeholderTextColor={colors.text.tertiary}
            />
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>Pricing</Text>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Cost Per Unit</Text>
            <TextInput
              style={styles.textInput}
              value={costPerUnit}
              onChangeText={setCostPerUnit}
              keyboardType="numeric"
              placeholder="0.000001"
              placeholderTextColor={colors.text.tertiary}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Credit Cost</Text>
            <TextInput
              style={styles.textInput}
              value={creditCost}
              onChangeText={setCreditCost}
              keyboardType="numeric"
              placeholder="1"
              placeholderTextColor={colors.text.tertiary}
            />
          </View>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>Status</Text>

          <View style={styles.formFieldRow}>
            <View style={styles.toggleField}>
              <Text style={styles.formLabel}>Active</Text>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: '#555', true: colors.brand.primary }}
              />
            </View>
            <View style={styles.toggleField}>
              <Text style={styles.formLabel}>Set as Primary</Text>
              <Switch
                value={isPrimary}
                onValueChange={setIsPrimary}
                trackColor={{ false: '#555', true: colors.brand.primary }}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.modalFooter}>
        <TouchableOpacity style={styles.cancelButton} onPress={() => setStep('catalog')}>
          <Text style={styles.cancelButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, (!isFormValid || createMutation.isPending) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!isFormValid || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator size="small" color={colors.text.primary} />
          ) : (
            <Text style={styles.saveButtonText}>Create Provider</Text>
          )}
        </TouchableOpacity>
      </View>

      {createMutation.isError && (
        <Text style={styles.errorMessage}>
          Failed to create: {(createMutation.error as Error)?.message || 'Unknown error'}
        </Text>
      )}
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>{step === 'catalog' ? renderCatalogStep() : renderFormStep()}</View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme, bottomInset: number) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.background.secondary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '85%',
      paddingBottom: Math.max(bottomInset, Platform.OS === 'ios' ? 20 : 8),
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    modalSubtitle: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 2,
    },
    formHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    backButton: {
      padding: 4,
    },

    // ── Category Bar ──
    categoryBar: {
      maxHeight: 48,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    categoryBarContent: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.background.darkCard,
    },
    categoryChipActive: {
      backgroundColor: colors.brand.primary + '25',
    },
    categoryChipText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    categoryChipTextActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
    categoryChipCount: {
      backgroundColor: colors.text.tertiary + '30',
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 1,
      minWidth: 20,
      alignItems: 'center',
    },
    categoryChipCountActive: {
      backgroundColor: colors.brand.primary + '30',
    },
    categoryChipCountText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text.tertiary,
    },
    categoryChipCountTextActive: {
      color: colors.brand.primary,
    },

    // ── Discovery States ──
    discoveryLoading: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      paddingHorizontal: 32,
      gap: 12,
    },
    discoveryLoadingTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      textAlign: 'center',
    },
    discoveryLoadingSubtitle: {
      fontSize: 13,
      color: colors.text.tertiary,
      textAlign: 'center',
      lineHeight: 18,
    },
    discoveryError: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 50,
      paddingHorizontal: 32,
      gap: 10,
    },
    discoveryErrorTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    discoveryErrorSubtitle: {
      fontSize: 13,
      color: colors.text.tertiary,
      textAlign: 'center',
      lineHeight: 18,
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.brand.primary + '20',
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.brand.primary,
    },

    // ── Catalog Cards ──
    catalogList: {
      paddingHorizontal: 12,
      paddingVertical: 16,
    },
    catalogCard: {
      width: CARD_WIDTH,
      marginHorizontal: CARD_MARGIN,
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      overflow: 'hidden',
    },
    catalogCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
    },
    catalogIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    catalogCardBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: colors.background.secondary,
    },
    catalogCardBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    catalogCardBody: {
      paddingHorizontal: 12,
      paddingBottom: 12,
    },
    catalogCardName: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 2,
    },
    catalogCardModel: {
      fontSize: 12,
      color: colors.text.tertiary,
      fontFamily: 'monospace',
      marginBottom: 6,
    },
    catalogCardDesc: {
      fontSize: 12,
      color: colors.text.secondary,
      lineHeight: 17,
      marginBottom: 10,
    },
    catalogCardMeta: {
      flexDirection: 'row',
      gap: 12,
    },
    catalogCardMetaItem: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: colors.background.primary,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.xs,
    },
    catalogCardMetaLabel: {
      fontSize: 9,
      fontWeight: '600',
      color: colors.text.tertiary,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    catalogCardMetaValue: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.primary,
    },
    catalogCardFooter: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      borderTopWidth: 1,
    },
    catalogCardSelect: {
      fontSize: 13,
      fontWeight: '600',
    },

    // ── Empty State ──
    emptyCategory: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      gap: 12,
    },
    emptyCategoryText: {
      fontSize: 14,
      color: colors.text.tertiary,
    },

    // ── Footer Buttons ──
    rediscoverButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.brand.primary + '15',
      borderWidth: 1,
      borderColor: colors.brand.primary + '40',
    },
    rediscoverText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.brand.primary,
    },
    customProviderButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.muted,
      borderStyle: 'dashed',
    },
    customProviderText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.secondary,
    },

    // ── Form ──
    modalBody: {
      padding: 16,
      maxHeight: 500,
    },
    formSection: {
      marginBottom: 24,
    },
    formSectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 12,
    },
    formField: {
      marginBottom: 16,
    },
    formLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text.primary,
      marginBottom: 4,
    },
    formHint: {
      fontSize: 11,
      color: colors.text.tertiary,
      marginBottom: 6,
    },
    textInput: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      fontSize: 14,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    textArea: {
      minHeight: 72,
    },
    selectInput: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    selectInputText: {
      fontSize: 14,
      color: colors.text.primary,
    },
    pickerDropdown: {
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.sm,
      marginTop: 4,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    pickerOption: {
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    pickerOptionSelected: {
      backgroundColor: colors.brand.primary + '30',
    },
    pickerOptionText: {
      fontSize: 14,
      color: colors.text.primary,
    },
    pickerOptionTextSelected: {
      fontWeight: '600',
    },
    formFieldRow: {
      flexDirection: 'row',
      gap: 16,
    },
    toggleField: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.background.darkCard,
      padding: 12,
      borderRadius: BORDER_RADIUS.sm,
    },
    modalFooter: {
      flexDirection: 'row',
      gap: 12,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border.muted,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.darkCard,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    saveButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.brand.primary,
      alignItems: 'center',
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
    },
    errorMessage: {
      fontSize: 12,
      color: colors.semantic.error,
      textAlign: 'center',
      padding: 8,
    },
  });
