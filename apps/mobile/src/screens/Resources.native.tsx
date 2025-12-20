// apps/mobile/src/pages/Resources.native.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { MainStackParamList } from '../navigation/types';
import { Image } from 'expo-image'; // ⬅️ expo-image for caching
import tw from '../../tailwind';

/* ------------------------------- Types & Nav ------------------------------ */

type Subject = { name: string; image: string };
type Nav = StackNavigationProp<MainStackParamList, 'Resources'>;

/* ---------------------------------- Data ---------------------------------- */

const POPULAR_SUBJECTS: Subject[] = [
  {
    name: 'Mathematics',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuArQ8nhWTn2okvVCCirH4UbQH41aue4bkzBkbsdXOStRVddPLGjMq2lg-iygCTNGqrnUgq2MP1YO3Aw4KQUbVrN5pfxtrjNtC5o1kC4Tuba62f0pLTn3YspVtxO1QGnTj6PI7I5iIs3_Qgw8pDcvK13CwX8s8YYRKm7JmexSEJjzCP5f_kcMBBLVEM8XWfDYZ5GQxnRvuNjL4g363LH0DVxkZy_ET_0foTUHlCsOthl2tu80DInSUv65dZUVOyAL_IeCRj5vN3wDt0',
  },
  {
    name: 'Science',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDCxsF3NWeAGHus2HulU0lOsPl5h12KA5pyvXUKOKV0XWMvVqUOtwull9H2XBrYCNBHWBN_NdX8yTg2sh7mV0K2Jek9uxkgGxI0Ebo8Ndv5vbULulu-0WbSIH09Ph_HJsgbq2mUyKl5sdD1zxNsLgS-0_CJd8GIcl9uurYwNWn7aiB3I6eX903xhu4x2YQmTtMp-LMpNwNw1NQfg4BUn2Lt9Der_2sQPbyYqQsM5nF0YROs8d8UsGYBUUHe3UokS9zXGhc1emsqOuw',
  },
  {
    name: 'English',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAps3FAm82gW8udYqRcZK21oWFNx2mZk010tOWH-0ukd23mg4OYnUnesoZmUViRikoIUGkusae_pCifu7-dUkeOTNoH7yprxBlf1m4XGmTIi2nz8w32dGhLV3stnTpKGwckR0MHg6R-uhYR5rtK5tvSEVQqYrq3IZ2WbWpAmQqlo3FYThRYklu_hZhzYL7eUQrwgwVWebruR2Rk9k8S7MrL0lrVJvwJGw_MH0CBfW5fH_BQEs7JHIJimtDU0MjHSHdDvXJv4Ip-bM8',
  },
  {
    name: 'History',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuA-YHR2tJELu6dDqz33ps9Efxej-XpX86z6lf-H6qdqEKP8OKQqMxixnXwlcW1MAU2HS6m2eiyp6-sZ7kIVMm5cT2txxNfZaiajFHhSTy9q8H1dYBb7caV9s_QFMEDban0tnlcxaW0el6d74UlNd3Iz4O1IWELqh6xrsdJol7MFNF3SAL_pbcl7ngrmxerhk3BvY8wUmpiufeAZTOPCkSO8OkifdW17AKi0Ha8TFMANshfB5IsUJbJfjBvwbd5J5X0ka9ydtRKOTlM',
  },
  {
    name: 'Computer Science',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuD7zc1erVhF-pdiqxal89vYc2ZYGdFwiC_eHIgnkPmAgv6g2tlBM32J8s5Ig_bzTG50latXva_gZd0v26VubI186lTN2pWbfkRLTWiazgK1n-ocE8oxHZg9fwN4901ilu7A6FEo-8CDZUvuYpnggmFr_1z9KDOuI5XrZz8OeIEBdJ71ZXiHuz7TqmOOau7sykQIkdjlm01lrpdw41FDMFxS_lWaVqwR6pM3K0Pp-aElQZBNq-BlfqgUR13Z0hBooJ2z3nVvx4cQnQE',
  },
  {
    name: 'Foreign Languages',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuD8-tbCZT3bPy3YUQ-vhb_8hJFoMyS6kZSg3iWvOmaDg-nfo28AFs5vFlZJe8aaECP94W57U14UZrtiJY13G4LiJQ_ng-Xz9M0ivrRqiae-_u6BkotWFyW5F43ELnTOcKRIY_FoLxH8r-f7hV_AFsc2T41gix-si4yx3GjB2iwqJaVRl1QUzQndjo2ydRKJoFyYFPl_0Y0fpAjN45czOKNviPAHFVo6P0Si4dCqukxkJGxFnuFZQAALgan7KPy9u18DfY_zNQGbXWg',
  },
  {
    name: 'Arts',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDnVytQiaMvFeaqGqFb121Z3wjhYbTJxujUQnE_nzSXBQJ84Lai-VKDukNMPgAf-3BuRHCpd_AzVbjGtS8c31U0JWgh-Q96mJzN61fqXhUQS9GYEasCVlvIQcJ-EMQJCO-eqzXJZiwb1daoxfe7-55YVHSi4hQ0znokDqwwzh5udyzzHAWIuJC-BDw2a4F-MFSN4YyQLtmMFkE-nPDop551079fsoL4JlbsD5SmQCyjLvrgDdj9tn-gh77dCbH8NDXOzQsfJP8fYn0',
  },
  {
    name: 'Social Studies',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCMTBhiWjHOx6Edd8fdULVDwMg6mEHcvtlV0wyL59QQH2YcoD0B0V5kVVzdVIzuupJeZXd5BuoIA2HsVdpSvekYaPZvJRPKGjTrJnTAcFVqEfhMbDJp62DD6uccWebFuFhxIukYoj-zLAzraIN8kMNykKQTC8i2NlJ5iTJEQMtJvYLdRF3lZGot8RS51Qjr1qz18y_XoM_OMcD_YcqNZfIRf-tf1XukJFSojBkj1pblGkPw-kFiid_QnX8X8ZRs1a2oeEYOKQ_IEMg',
  },
];

const ALL_SUBJECTS: Subject[] = [
  ...POPULAR_SUBJECTS,
  {
    name: 'Business',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBiP4zUKuy13X91XlG58hWmkQyVoI7aKpA0B6LjnBfVMmhGjxCexioEJSXgABlYBM5L7WtHY2gl1b20SotQqh-GRy_OyTQ5DL_-cvHWWg3J5wlt9rjjb7iEbR8KXVcaUIG18Grv_Mxz76ImUCSII4sUVRtPvZgE6nYb1CGRoxuj0K9_KJ_qEFKgAI0CQpCKHx8RKDTCTTOuK7BmSUYimKK22FB-MEXVB3kY131A-i1FsuUIjrdRMh_HAVcz-NEo8WnYpz2OU8IeNec',
  },
  {
    name: 'Engineering',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAwINsG5rpZGfCBG1qycJ8qe664npfy9vjX_jklqbkzhyI__3CLU2_jOodKHqIfGP-gclJuKeLGOczFMIGNit9XRsMx5dfAl0B43IvgsIIhHD3IZxYVXT-hXWlQpk4X76V0VAnbhGHK2gbBjhV1LmMfgpjqp_rfzhbXv9OPGeP4dYWcQhuYnDgMgq85gGVR3eBmrxAtCLQa76FcDMzvPy_6WBxlO4lDZWhjjRnTa3i0_UeOIrbjY3HOJnpRIEvXYiMwf4dKl13GdmU',
  },
  {
    name: 'Law',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBJYNchEv-9hrJW0NAoszNIRPogRvfgV1vDUxzSDF02hnSvKQTifFpG1HDasCxPCUPVpGhQ6tkBMXqN7iUTGBTo71sl3UKF7aMSb-q0MtEK-XHeeB1IC-xP8krG-owqhBf-MTdDjt7yOE7ZO8_9-kNL5PtItiyiQBJcNeuqaO9O-kqSswOPHrWRx8ejrkC0GfM624UwjhZWaLF1WMbRnZjRjFxrhaMutZJtYj9cIa4DpFBaqWnf1DQNW2q6EYIdYpB9pGpqg3OAIHk',
  },
  {
    name: 'Medicine',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAxBriO-lFQXu3br7pIE9fxt5cDN2NnJ0Dm2m1_epPWSeWJpcBn0cU-hPM56Q17ATKzeO1a7XT7orIFy4IvpVRUl8zSO6ft1GwrTm7KqXvuFJoVDy8yCCHBtLulG1BhLU-S60DVYODAsuRmmmU19iEg6Oq2J9GR0aeKK-WCkOGEqZ-6duM6_EavHyEswXYsJ8CPMw1CaPxwqpG0wVz6nCgjvzZQsBJQiqZpyKIGzA9vxYZGz8-RJfsuHwE0FiwXuqUJ4ejNEvpjycQ',
  },
  {
    name: 'Music',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuALGy19vI2lzoPPIhYCOKDc8OrN57brwun5FWh6Z1slmxYnFsKUI1yDYxR2fDu4hIrFr2jVNDgnabPRu997LWzoHcYcPfc22H-7hWmW0QgAlT0327s1IPSwfjHT8hDvccrNrw7B2HkG7l8keAD-oFWiEO2b46nw86VNYClP6iQ71GLR427LnvxiEqtl19iXrpOyfdo0lz2ncaWdEwgPHqsrcxqJ0F8cQli4rAHsjYHEuGIT0rH6zeNvtMdgOlUER51JLfbsjOXcNuo',
  },
  {
    name: 'Philosophy',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCMTBhiWjHOx6Edd8fdULVDwMg6mEHcvtlV0wyL59QQH2YcoD0B0V5kVVzdVIzuupJeZXd5BuoIA2HsVdpSvekYaPZvJRPKGjTrJnTAcFVqEfhMbDJp62DD6uccWebFuFhxIukYoj-zLAzraIN8kMNykKQTC8i2NlJ5iTJEQMtJvYLdRF3lZGot8RS51Qjr1qz18y_XoM_OMcD_YcqNZfIRf-tf1XukJFSojBkj1pblGkPw-kFiid_QnX8X8ZRs1a2oeEYOKQ_IEMg',
  },
  {
    name: 'Psychology',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCPS3LT7Eli3K5j5GQj81m8f30eLZdjz00NSjy2D8qBUiVZ1_SkwtSkLwbQLfhM7qfEgoIaqVn_k8oDkJSpCg0mqYK_GeU-ACA2LoiVfJBQkRgD6EcpvkvqNLpI-bRiL8Oj787I6hF6pJPxvrtLt2nVpFGPGUs7ME7L1z6m3ydDQE6ciGCmM-HsuHsstMwiIxua1bw6kw5uR0MOB0efRtTmxaN3kwYjUUB6Xs4l4BMQARg8dTm92oLAQzMCmODuWkWFZ4dCx7zBLts',
  },
  {
    name: 'Sociology',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCLZ40EaXYIMuN1C5bzX6CIPpQo8h5ebnY0XTSVbBxv3PF1C-NLk3Nufe522-xXVc6OMYg24s9CJb9yFc956WsZEgscuQYhdgsYRZlog1LulXd55oPJLIjWpV7k2fc3ETZibBKDxGtq7rywpso9XOZPqQIF1SuihcNnqRPydhde7u4p0dA_W0pjRFC8IgFT4dqPvnYw1CXW9LIWrVpNbJeKZ9Vtx5p7obG6ca5h51y_qvbMNMqjYCnmH2Lt6PszMvNxFee-mQSQOww',
  },
];

/* ------------------------------ UI pieces -------------------------------- */

const SubjectCard: React.FC<{ subject: Subject; onPress: () => void }> = ({ subject, onPress }) => (
  <Pressable onPress={onPress} style={tw`flex flex-col gap-2 pb-3`}>
    {/* container to get rounded corners + overflow for overlay */}
    <View style={tw`w-full aspect-square rounded-xl overflow-hidden`}>
      <Image
        source={{ uri: subject.image }}
        style={tw`w-full h-full`}
        contentFit="cover"
        transition={150} // smooth fade-in
        cachePolicy="memory-disk" // ⬅️ cache aggressively
        recyclingKey={subject.image} // better memory reuse on lists
      />
      {/* optional subtle overlay sheen */}
      <View style={tw`absolute inset-0`} pointerEvents="none" />
    </View>
    <Text style={tw`text-[#0d141c] dark:text-white/90 text-base font-medium`}>{subject.name}</Text>
  </Pressable>
);

/* --------------------------------- Screen -------------------------------- */

const ResourcesPage: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<any>();
  const initialQ = (route?.params?.q as string | undefined) ?? '';
  const [query, setQuery] = useState<string>(initialQ);

  const filterFn = useMemo(
    () => (s: Subject) => s.name.toLowerCase().includes(query.trim().toLowerCase()),
    [query]
  );

  const popular = useMemo(() => POPULAR_SUBJECTS.filter(filterFn), [filterFn]);
  const all = useMemo(() => ALL_SUBJECTS.filter(filterFn), [filterFn]);

  const goFindTutor = (subjectName: string) => {
    navigation.navigate('FindTutor', { subject: subjectName } as any);
  };

  return (
    <ScrollView
      style={tw`flex-1 bg-slate-50 dark:bg-[#0b1016]`}
      contentContainerStyle={{ paddingBottom: 24 }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View style={tw`w-full px-4 py-6`}>
        {/* Title row */}
        <View style={tw`flex-row items-center justify-between`}>
          <Text style={tw`tracking-tight text-[28px] font-bold text-slate-900 dark:text-white`}>
            Explore subjects
          </Text>
        </View>

        {/* Search input */}
        <View style={tw`mt-4`}>
          <View
            style={tw`h-12 w-full rounded-xl border border-[#e7edf4] dark:border-white/10 bg-[#e7edf4] dark:bg-[#172534] flex-row items-center px-3`}
          >
            <Text style={tw`text-[#49739c] dark:text-white/80 text-base mr-2`}>🔍</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search for subjects"
              placeholderTextColor="#7a8aa0"
              style={tw`flex-1 h-full text-slate-900 dark:text-slate-100`}
            />
          </View>
        </View>

        {/* Popular subjects */}
        <Text
          style={tw`text-[22px] font-bold tracking-tight text-slate-900 dark:text-white mt-6 mb-3`}
        >
          Popular subjects
        </Text>
        {popular.length === 0 ? (
          <Text style={tw`text-[#49739c] dark:text-white/70 px-1`}>No matches.</Text>
        ) : (
          <View style={tw`flex-row flex-wrap -mx-1`}>
            {popular.map((s) => (
              <View key={`pop-${s.name}`} style={tw`w-1/2 px-1 mb-3`}>
                <SubjectCard subject={s} onPress={() => goFindTutor(s.name)} />
              </View>
            ))}
          </View>
        )}

        {/* All subjects */}
        <Text
          style={tw`text-[22px] font-bold tracking-tight text-slate-900 dark:text-white mt-6 mb-3`}
        >
          All subjects
        </Text>
        {all.length === 0 ? (
          <Text style={tw`text-[#49739c] dark:text-white/70 px-1`}>No matches.</Text>
        ) : (
          <View style={tw`flex-row flex-wrap -mx-1`}>
            {all.map((s) => (
              <View key={`all-${s.name}`} style={tw`w-1/2 px-1 mb-3`}>
                <SubjectCard subject={s} onPress={() => goFindTutor(s.name)} />
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
};

export default ResourcesPage;
