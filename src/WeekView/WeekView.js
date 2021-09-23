import React, { Component } from 'react';
import PropTypes from 'prop-types';
import {
  View,
  ScrollView,
  RefreshControl,
  Animated,
  VirtualizedList,
  InteractionManager,
} from 'react-native';
import moment from 'moment';
import memoizeOne from 'memoize-one';

import Event from '../Event/Event';
import Events from '../Events/Events';
import Header from '../Header/Header';
import Title from '../Title/Title';
import Times from '../Times/Times';
import styles from './WeekView.styles';
import {
  CONTAINER_HEIGHT,
  DATE_STR_FORMAT,
  availableNumberOfDays,
  setLocale,
  CONTAINER_WIDTH,
} from '../utils';

const MINUTES_IN_DAY = 60 * 24;

export default class WeekView extends Component {
  constructor(props) {
    super(props);
    this.eventsGrid = null;
    this.verticalAgenda = null;
    this.header = null;
    this.pageOffset = 2;
    this.scroll = false;
    this.currentPageIndex = this.pageOffset;
    this.eventsGridScrollX = new Animated.Value(0);

    const initialDates = this.calculatePagesDates(
      props.selectedDate,
      props.numberOfDays,
      props.prependMostRecent,
    );
    this.state = {
      // currentMoment should always be the first date of the current page
      currentMoment: moment(initialDates[this.currentPageIndex]).toDate(),
      initialDates,
    };

    setLocale(props.locale);
  }

  componentDidMount() {
    requestAnimationFrame(() => {
      this.scrollToVerticalStart();
    });
    this.eventsGridScrollX.addListener((position) => {
      this.header.scrollToOffset({ offset: position.value, animated: false });
    });
  }

  componentDidUpdate(prevprops) {
    if(this.props.locale !== prevprops.locale) {
      setLocale(this.props.locale);
    }

    // Detect change
    if(this.props.numberOfDays !== prevprops.numberOfDays){
      const lastIndex = this.state.initialDates[this.currentPageIndex]

      const initialDates = this.calculatePagesDates(
        this.state.currentMoment,
        this.props.numberOfDays,
        prevprops.prependMostRecent,
      );

      const callback = () => {
        if(this.props.numberOfDays === 1){
          let index = this.state.initialDates.findIndex(item => item === lastIndex)
          if(index < 0) index = 2;

          this.eventsGrid.scrollToIndex({ index: index, animated: false });
          this.currentPageIndex = index;
        }
      }
      this.setState({ initialDates }, callback)
    }
  }

  componentWillUnmount() {
    this.eventsGridScrollX.removeAllListeners();
  }

  formatDate = (date) => `${date.getFullYear()}-${this.addZero(+date.getMonth() + 1)}-${this.addZero(date.getDate())}`

  addZero = memoizeOne(n => n<10 ? '0'+n : n);
  getDate = memoizeOne(date => {
    const str = date.split('-')
    return new Date(str[0], str[1] - 1, str[2]);
  })
  getMonday = memoizeOne(date => {
    const diff = date.getDate() - date.getDay() + (date.getDay() == 0 ? -6:1);
    date.setDate(diff)
    return date
  })

  changeDate = (last, prev) => {
    last = this.getDate(last);
    prev = this.getDate(prev);
    if(last.getDay() !== 1 || last.getDay() !== 4){
      last = new Date(prev.getTime());
      if(prev.getDay() === 1){
        last.setDate(last.getDate() - 4)
      } else if (prev.getDay() === 4){
        last.setDate(last.getDate() - 3)
      }
    }
    return this.formatDate(last)
  }

  rangeDatesPrev = (initialDates) => {
    if(this.props.numberOfDays === 1) return this.rangeDates(initialDates);
    const size = 8;

    let arr = [];
    for (let i = 0; i < size; i++) {
      arr.push(
        this.changeDate(
          initialDates[size - 1 - i],
          arr[i - 1] || initialDates[size]
        )
      )
    }

    return [...arr.reverse(), ...initialDates.slice(size)]
  }

  rangeDatesNext = (initialDates) => {
    if(this.props.numberOfDays === 1) return this.rangeDates(initialDates);

    let last = this.getDate(initialDates[initialDates.length - 1]);
    if(last.getDay() !== 1 || last.getDay() !== 4){
      const prev = this.getDate(initialDates[initialDates.length - 2]);
      last = new Date(prev.getTime());

      if(prev.getDay() === 1){
        last.setDate(last.getDate() + 3)
      } else if (prev.getDay() === 4){
        last.setDate(last.getDate() + 4)
      }

      initialDates.pop()
      return [...initialDates, this.formatDate(last)];
    }
    return initialDates
  }

  rangeDates = memoizeOne(initialDates => {
    let dates = [];

    // Dont show sunday on daily
    if(this.props.numberOfDays === 1){
      for (let i = 0; i < initialDates.length; i++) {
        let date = this.getDate(initialDates[i])
        if(!date.getDay()){
          date.setDate(date.getDate() + 1);
          dates.push(this.formatDate(date))
        } else {
          dates.push(initialDates[i])
        }
      }
      // No repeat monday
      dates =  [...new Set(dates)];
      if(dates.length !== initialDates.length){
        this.currentPageIndex--;
      }
      return dates;
    }

    const date = this.getMonday(this.getDate(initialDates[0]))
    dates.push(this.formatDate(date))

    for (let i = 1; i < initialDates.length; i++) {
      if(!(i % 2)){
        date.setDate(date.getDate() + 4)
      } else {
        date.setDate(date.getDate() + 3)
      }
      dates.push(this.formatDate(date))
    }

    return dates;
  })

  calculateTimes = memoizeOne((minutesStep) => {
    const times = [];
    for (let timer = 0; timer < MINUTES_IN_DAY; timer += minutesStep) {
      let minutes = timer % 60;
      if (minutes < 10) minutes = `0${minutes}`;
      const hour = Math.floor(timer / 60);
      const timeString = `${hour}:${minutes}`;
      times.push(timeString);
    }
    return times.slice(7);
  });

  scrollToVerticalStart = () => {
    if (this.verticalAgenda) {
      const { startHour, hoursInDisplay } = this.props;
      const startHeight = (startHour * CONTAINER_HEIGHT) / hoursInDisplay;
      this.verticalAgenda.scrollTo({ y: startHeight, x: 0, animated: false });
    }
  };

  getSignToTheFuture = () => {
    const { prependMostRecent } = this.props;

    const daySignToTheFuture = prependMostRecent ? -1 : 1;
    return daySignToTheFuture;
  };

  prependPagesInPlace = (initialDates, nPages) => {
    const { numberOfDays } = this.props;
    const daySignToTheFuture = this.getSignToTheFuture();

    const first = initialDates[0];
    const daySignToThePast = daySignToTheFuture * -1;
    const addDays = numberOfDays * daySignToThePast;
    for (let i = 1; i <= nPages; i += 1) {
      const initialDate = moment(first).add(addDays * i, 'd');
      initialDates.unshift(initialDate.format(DATE_STR_FORMAT));
    }
  };

  appendPagesInPlace = (initialDates, nPages) => {
    const { numberOfDays } = this.props;
    const daySignToTheFuture = this.getSignToTheFuture();

    const latest = initialDates[initialDates.length - 1];
    const addDays = numberOfDays * daySignToTheFuture;
    for (let i = 1; i <= nPages; i += 1) {
      const initialDate = moment(latest).add(addDays * i, 'd');
      initialDates.push(initialDate.format(DATE_STR_FORMAT));
    }
  };

  goToDate = (targetDate, animated = true) => {
    const { initialDates } = this.state;
    const { numberOfDays } = this.props;

    const currentDate = moment(initialDates[this.currentPageIndex]).startOf('day');
    const deltaDay = moment(targetDate).startOf('day').diff(currentDate, 'day');
    const deltaIndex = Math.floor(deltaDay / numberOfDays);
    const signToTheFuture = this.getSignToTheFuture();
    let targetIndex = this.currentPageIndex + deltaIndex * signToTheFuture;

    this.goToPageIndex(targetIndex, animated, targetDate);
  };

  goToNextPage = (animated = true) => {
    const signToTheFuture = this.getSignToTheFuture();
    this.goToPageIndex(this.currentPageIndex + 1 * signToTheFuture, animated);
  }

  goToPrevPage = (animated = true) => {
    const signToTheFuture = this.getSignToTheFuture();
    this.goToPageIndex(this.currentPageIndex - 1 * signToTheFuture, animated);
  }

  goToPageIndex = (targetIndex, animated = true, targetDate) => {
    if (targetIndex === this.currentPageIndex) {
      return;
    }

    const initialDates = [...this.state.initialDates];
    const lastViewablePage = initialDates.length - this.pageOffset;
    const newState = {};

    if (targetIndex < this.pageOffset) {
      this.prependPagesInPlace(initialDates, this.pageOffset - targetIndex);

      targetIndex = this.pageOffset;
    } else if (targetIndex > lastViewablePage) {
      this.appendPagesInPlace(initialDates, targetIndex - lastViewablePage);

      targetIndex = initialDates.length - this.pageOffset;
    }

    newState.currentMoment = moment(initialDates[targetIndex]).toDate();
    newState.initialDates = this.calculatePagesDates(
      targetDate || newState.currentMoment,
      this.props.numberOfDays,
      this.props.prependMostRecent,
    )
    if(targetDate.getDay() >= 4){ targetIndex = 3; }
    else { targetIndex = 2; }

    const scrollTo = () => {
      this.eventsGrid.scrollToIndex({ index: targetIndex, animated: false });
      this.currentPageIndex = targetIndex;
    }

    this.setState(newState, scrollTo);
  };

  scrollBegin = (event) => {
    this.scroll = true;
  }

  scrollEnded = (event) => {
    if(!this.scroll) return;
    this.scroll = false;

    const {
      nativeEvent: { contentOffset, contentSize },
    } = event;
    const { x: position } = contentOffset;
    const { width: innerWidth } = contentSize;
    const { onSwipePrev, onSwipeNext } = this.props;
    const { initialDates } = this.state;

    const newPage = Math.round((position / innerWidth) * initialDates.length);
    const movedPages = newPage - this.currentPageIndex;
    this.currentPageIndex = newPage;

    if (movedPages === 0) {
      return;
    }

    InteractionManager.runAfterInteractions(() => {
      const newMoment = moment(initialDates[this.currentPageIndex]).toDate();
      const newState = {
        currentMoment: newMoment
      };
      let newStateCallback = () => {};

      if (movedPages < 0 && newPage < this.pageOffset) {
        if(this.currentPageIndex < 1){
          this.prependPagesInPlace(initialDates, 8);
          this.currentPageIndex += 8;
          newState.initialDates = this.rangeDatesPrev([...initialDates])
          const scrollToCurrentIndex = () =>
            this.eventsGrid.scrollToIndex({
              index: this.currentPageIndex,
              animated: false,
            });
          newStateCallback = () => setTimeout(scrollToCurrentIndex, 0);
        }
      } else if (
        movedPages > 0 &&
        newPage >= this.state.initialDates.length - this.pageOffset
      ) {
        this.appendPagesInPlace(initialDates, 1);
        newState.initialDates = this.rangeDatesNext([...initialDates])
      }

      this.setState(newState, newStateCallback);

      if (movedPages < 0) {
        onSwipePrev && onSwipePrev(newMoment);
      } else {
        onSwipeNext && onSwipeNext(newMoment);
      }
    });
  };

  eventsGridRef = (ref) => {
    this.eventsGrid = ref;
  };

  verticalAgendaRef = (ref) => {
    this.verticalAgenda = ref;
  };

  headerRef = (ref) => {
    this.header = ref;
  };

  calculatePagesDates = (currentMoment, numberOfDays, prependMostRecent) => {
    const initialDates = [];
    const centralDate = moment(currentMoment);
    if (numberOfDays === 7) {
      // Start week on monday
      centralDate.startOf('isoWeek');
    }
    for (let i = -this.pageOffset; i <= this.pageOffset; i += 1) {
      const initialDate = moment(centralDate).add(numberOfDays * i, 'd');
      initialDates.push(initialDate.format(DATE_STR_FORMAT));
    }

    return this.rangeDates(initialDates);
  };

  sortEventsByDate = memoizeOne((events) => {
    // Stores the events hashed by their date
    // For example: { "2020-02-03": [event1, event2, ...] }
    // If an event spans through multiple days, adds the event multiple times
    const sortedEvents = {};
    events.forEach((event) => {
      const startDate = moment(event.startDate);
      const endDate = moment(event.endDate);

      for (
        let date = moment(startDate);
        date.isSameOrBefore(endDate, 'days');
        date.add(1, 'days')
      ) {
        // Calculate actual start and end dates
        const startOfDay = moment(date).startOf('day');
        const endOfDay = moment(date).endOf('day');
        const actualStartDate = moment.max(startDate, startOfDay);
        const actualEndDate = moment.min(endDate, endOfDay);

        // Add to object
        const dateStr = date.format(DATE_STR_FORMAT);
        if (!sortedEvents[dateStr]) {
          sortedEvents[dateStr] = [];
        }
        sortedEvents[dateStr].push({
          ...event,
          startDate: actualStartDate.toDate(),
          endDate: actualEndDate.toDate(),
        });
      }
    });
    // For each day, sort the events by the minute (in-place)
    Object.keys(sortedEvents).forEach((date) => {
      sortedEvents[date].sort((a, b) => {
        return moment(a.startDate).diff(b.startDate, 'minutes');
      });
    });
    return sortedEvents;
  });

  getListItemLayout = (index) => ({
    length: CONTAINER_WIDTH,
    offset: CONTAINER_WIDTH * index,
    index,
  });

  render() {
    const {
      showTitle,
      numberOfDays,
      headerStyle,
      headerTextStyle,
      hourTextStyle,
      eventContainerStyle,
      formatDateHeader,
      onEventPress,
      events,
      hoursInDisplay,
      timeStep,
      onGridClick,
      EventComponent,
      prependMostRecent,
      rightToLeft,
      showNowLine,
      nowLineColor,
      isRefreshing,
      onRefresh,
      colors
    } = this.props;
    const { currentMoment, initialDates } = this.state;
    const times = this.calculateTimes(timeStep);
    const eventsByDate = this.sortEventsByDate(events);
    const horizontalInverted =
      (prependMostRecent && !rightToLeft) ||
      (!prependMostRecent && rightToLeft);

    return (
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <Title
            showTitle={showTitle}
            style={headerStyle}
            textStyle={headerTextStyle}
            numberOfDays={numberOfDays}
            selectedDate={currentMoment}
          />
          <VirtualizedList
            horizontal
            pagingEnabled
            inverted={horizontalInverted}
            showsHorizontalScrollIndicator={false}
            scrollEnabled={false}
            ref={this.headerRef}
            data={initialDates}
            getItem={(data, index) => data[index]}
            getItemCount={(data) => data.length}
            getItemLayout={(_, index) => this.getListItemLayout(index)}
            keyExtractor={(item) => item}
            initialScrollIndex={this.pageOffset}
            renderItem={({ item }) => {
              return (
                <View key={item} style={styles.header}>
                  <Header
                    style={headerStyle}
                    textStyle={headerTextStyle}
                    formatDate={formatDateHeader}
                    initialDate={item}
                    numberOfDays={numberOfDays}
                    rightToLeft={rightToLeft}
                  />
                </View>
              );
            }}
          />
        </View>
        <ScrollView
          ref={this.verticalAgendaRef}
          refreshControl={
            <RefreshControl
              colors={colors}
              refreshing={isRefreshing}
              onRefresh={onRefresh}
            />
          }
        >
          <View style={styles.scrollViewContent}>
            <Times
              times={times}
              textStyle={hourTextStyle}
              hoursInDisplay={hoursInDisplay}
              timeStep={timeStep}
            />
            <VirtualizedList
              data={initialDates}
              getItem={(data, index) => data[index]}
              getItemCount={(data) => data.length}
              getItemLayout={(_, index) => this.getListItemLayout(index)}
              keyExtractor={(item) => item}
              initialScrollIndex={this.pageOffset}
              renderItem={({ item }) => {
                return (
                  <Events
                    times={times}
                    eventsByDate={eventsByDate}
                    initialDate={item}
                    numberOfDays={numberOfDays}
                    onEventPress={onEventPress}
                    onGridClick={onGridClick}
                    hoursInDisplay={hoursInDisplay}
                    timeStep={timeStep}
                    EventComponent={EventComponent}
                    eventContainerStyle={eventContainerStyle}
                    rightToLeft={rightToLeft}
                    showNowLine={showNowLine}
                    nowLineColor={nowLineColor}
                  />
                );
              }}
              horizontal
              pagingEnabled
              inverted={horizontalInverted}
              onMomentumScrollBegin={this.scrollBegin}
              onMomentumScrollEnd={this.scrollEnded}
              scrollEventThrottle={32}
              onScroll={Animated.event(
                [
                  {
                    nativeEvent: {
                      contentOffset: {
                        x: this.eventsGridScrollX,
                      },
                    },
                  },
                ],
                { useNativeDriver: false },
              )}
              ref={this.eventsGridRef}
            />
          </View>
        </ScrollView>
      </View>
    );
  }
}

WeekView.propTypes = {
  events: PropTypes.arrayOf(Event.propTypes.event),
  formatDateHeader: PropTypes.string,
  numberOfDays: PropTypes.oneOf(availableNumberOfDays).isRequired,
  onSwipeNext: PropTypes.func,
  onSwipePrev: PropTypes.func,
  onEventPress: PropTypes.func,
  onGridClick: PropTypes.func,
  headerStyle: PropTypes.object,
  headerTextStyle: PropTypes.object,
  hourTextStyle: PropTypes.object,
  eventContainerStyle: PropTypes.object,
  selectedDate: PropTypes.instanceOf(Date).isRequired,
  locale: PropTypes.string,
  hoursInDisplay: PropTypes.number,
  timeStep: PropTypes.number,
  startHour: PropTypes.number,
  EventComponent: PropTypes.elementType,
  showTitle: PropTypes.bool,
  rightToLeft: PropTypes.bool,
  prependMostRecent: PropTypes.bool,
  showNowLine: PropTypes.bool,
  nowLineColor: PropTypes.string,
  isRefreshing: PropTypes.bool,
  onRefresh: PropTypes.func,
  colors: PropTypes.array
};

WeekView.defaultProps = {
  events: [],
  locale: 'en',
  hoursInDisplay: 6,
  timeStep: 60,
  startHour: 0,
  showTitle: true,
  rightToLeft: false,
  prependMostRecent: false,
};
