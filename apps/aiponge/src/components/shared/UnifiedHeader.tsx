import { View, Text, TouchableOpacity, TextInput, Animated, Keyboard } from 'react-native';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRef, useEffect } from 'react';
import { useThemeColors, BORDER_RADIUS } from '../../theme';
import { AccountIconMenu } from '../profile/AccountIconMenu';
import { MoreMenu } from './MoreMenu';
import { NetworkStatusBanner } from '../system/NetworkStatusBanner';
import { useSearch } from '../../stores';

interface UnifiedHeaderProps {
  title: string;
  showBackButton?: boolean;
}

export function UnifiedHeader({ title, showBackButton = false }: UnifiedHeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { query, setQuery, isSearchActive, setIsSearchActive, currentConfig } = useSearch();
  const searchInputRef = useRef<TextInput>(null);
  const searchWidthAnim = useRef(new Animated.Value(0)).current;

  const searchEnabled = currentConfig?.enabled ?? false;

  useEffect(() => {
    Animated.timing(searchWidthAnim, {
      toValue: isSearchActive ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();

    if (isSearchActive && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isSearchActive, searchWidthAnim]);

  const handleBackPress = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(user)/books' as Href);
    }
  };

  const handleSearchPress = () => {
    setIsSearchActive(true);
  };

  const handleSearchClose = () => {
    Keyboard.dismiss();
    setIsSearchActive(false);
  };

  const handleClearQuery = () => {
    setQuery('');
    searchInputRef.current?.focus();
  };

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.background.primary,
          borderBottomColor: colors.border.primary,
          borderBottomWidth: 1,
          paddingTop: insets.top + 12,
          paddingBottom: 12,
          paddingHorizontal: 16,
        }}
      >
        {isSearchActive ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
            <TouchableOpacity onPress={handleSearchClose} testID="header-search-back">
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.background.subtle,
                borderRadius: BORDER_RADIUS.sm,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Ionicons name="search" size={18} color={colors.text.secondary} />
              <TextInput
                ref={searchInputRef}
                value={query}
                onChangeText={setQuery}
                placeholder={currentConfig?.placeholder || 'Search...'}
                placeholderTextColor={colors.text.secondary}
                style={{
                  flex: 1,
                  marginLeft: 8,
                  fontSize: 16,
                  color: colors.text.primary,
                  padding: 0,
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                testID="header-search-input"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={handleClearQuery} testID="header-search-clear">
                  <Ionicons name="close-circle" size={18} color={colors.text.secondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 40 }}>
              {showBackButton ? (
                <TouchableOpacity onPress={handleBackPress} testID="header-back-button">
                  <Ionicons name="chevron-back" size={28} color={colors.text.primary} />
                </TouchableOpacity>
              ) : (
                <AccountIconMenu />
              )}
            </View>
            <View style={{ flex: 1, justifyContent: 'center', paddingLeft: 8 }}>
              <Text
                style={{
                  fontWeight: '600',
                  fontSize: 18,
                  color: colors.text.primary,
                }}
                numberOfLines={1}
              >
                {title}
              </Text>
            </View>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 40, justifyContent: 'flex-end' }}
            >
              {searchEnabled && (
                <TouchableOpacity onPress={handleSearchPress} testID="header-search-button">
                  <Ionicons name="search" size={22} color={colors.text.primary} />
                </TouchableOpacity>
              )}
              <MoreMenu />
            </View>
          </>
        )}
      </View>
      <NetworkStatusBanner />
    </>
  );
}
